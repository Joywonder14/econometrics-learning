/* Capability-based sync. Codes stay on this device; no identity provider is used.
 * Each vault has its own cache, pending operations and conflict drafts.
 */
(function (root) {
  'use strict';
  const FIELDS = ['seenAt', 'bookmark', 'note', 'quizChoice', 'quizCorrect', 'memory'];
  const ACTIVE = 'atlas-sync-active-v2', PREFIX = 'atlas-sync-vault-v2:';
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = (id, field) => id + ':' + field;
  let active = null, data = empty(), hooks = {}, busy = false, error = '', timer, epoch = 0, connectionIntent = 0;
  function empty() { return { cards: {}, versions: {}, pending: {}, conflicts: {}, lastSync: null }; }
  function read(name, fallback) { try { return JSON.parse(localStorage.getItem(name)) || fallback; } catch { return fallback; } }
  function cached(vaultId) {
    const stored = read(PREFIX + vaultId, empty()), result = empty();
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return result;
    for (const field of ['cards', 'versions', 'pending', 'conflicts']) {
      if (stored[field] && typeof stored[field] === 'object' && !Array.isArray(stored[field])) result[field] = stored[field];
    }
    result.lastSync = Number.isFinite(stored.lastSync) ? stored.lastSync : null;
    return result;
  }
  function persist() {
    try { if (active) localStorage.setItem(PREFIX + active.vaultId, JSON.stringify(data)); }
    catch { error = 'storage'; }
  }
  function notify(changed = false) { hooks.onChange?.(status(), changed ? clone(data.cards) : null); }
  function status() { return { connected: !!active, role: active?.role, busy, error, lastSync: data.lastSync, pending: Object.keys(data.pending).length, conflicts: clone(data.conflicts) }; }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => sync(), 1200); }
  async function request(path, { code = active?.code, method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    if (code) headers.Authorization = 'Bearer ' + code;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!res.ok) throw new Error(res.status === 401 ? 'code' : res.status === 429 ? 'rate' : 'server');
      return await res.json();
    } finally { clearTimeout(timeout); }
  }
  function patch(id, changes) {
    if (!active) return;
    data.cards[id] = { ...data.cards[id], ...clone(changes) };
    for (const field of FIELDS) {
      if (!(field in changes)) continue;
      const k = key(id, field), value = clone(changes[field]);
      if (data.conflicts[k]) { data.conflicts[k].local = value; continue; }
      data.pending[k] = { cardId: id, field, value, baseVersion: data.pending[k]?.baseVersion ?? data.versions[k] ?? 0, opId: crypto.randomUUID() };
    }
    persist(); notify(); schedule();
  }
  function applyRecord(r) {
    const k = key(r.cardId, r.field);
    // A delayed or restored snapshot must not roll back an acknowledged version.
    if (r.version < (data.versions[k] || 0)) return;
    data.versions[k] = r.version;
    data.cards[r.cardId] = { ...data.cards[r.cardId], [r.field]: clone(r.value) };
  }
  async function sync() {
    if (!active || busy) return;
    const run = epoch;
    busy = true; error = ''; notify();
    try {
      const remote = await request('/api/progress');
      if (run !== epoch) return;
      for (const r of remote.records || []) {
        if (!FIELDS.includes(r.field)) continue;
        const k = key(r.cardId, r.field), p = data.pending[k];
        if (data.conflicts[k]) {
          if (r.version >= (data.conflicts[k].record?.version || 0)) {
            data.conflicts[k].record = r; data.conflicts[k].remote = clone(r.value);
          }
        } else if (!p) applyRecord(r);
        else if (p.opId === r.opId) { delete data.pending[k]; applyRecord(r); }
      }
      // Bound work per round while accepting up to one patch for each field.
      const sent = Object.values(data.pending).slice(0, 100).map(clone);
      if (sent.length) {
        const sentIds = new Set(sent.map(p => p.opId));
        const reply = await request('/api/progress', { method: 'POST', body: { patches: sent } });
        if (run !== epoch) return;
        for (const result of reply.results || []) {
          if (!sentIds.has(result.opId)) continue;
          const k = key(result.cardId, result.field), current = data.pending[k];
          if (!current) continue;
          if (result.status === 'conflict') {
            data.conflicts[k] = { cardId: result.cardId, field: result.field, local: clone(current.value), remote: result.record ? clone(result.record.value) : null, record: result.record };
            delete data.pending[k];
          } else if (result.record && ['applied', 'duplicate'].includes(result.status)) {
            data.versions[k] = Math.max(data.versions[k] || 0, result.record.version);
            if (current.opId === result.opId) { delete data.pending[k]; applyRecord(result.record); }
            else current.baseVersion = result.record.version;
          }
        }
      }
      data.lastSync = Date.now(); persist(); notify(true);
    } catch (e) { if (run === epoch) { error = ['code', 'rate', 'server'].includes(e.message) ? e.message : 'offline'; persist(); } }
    finally {
      if (run === epoch) { busy = false; notify(); if (!error && Object.keys(data.pending).length) schedule(); }
    }
  }
  async function connect(code, seed = null) {
    code = String(code).trim();
    if (!code || code.length > 200) throw new Error('code');
    // Authentication can overlap an old sync or another connection attempt.
    // Only the newest explicit connection intent may replace the active vault.
    const intent = ++connectionIntent;
    const session = await request('/api/session', { code });
    if (intent !== connectionIntent) throw new Error('superseded');
    if (!session.connected || !session.vaultId) throw new Error('code');
    persist(); clearTimeout(timer); epoch++; busy = false;
    active = { code, vaultId: session.vaultId, role: session.role || 'learner' };
    data = cached(active.vaultId);
    error = '';
    try { localStorage.setItem(ACTIVE, JSON.stringify(active)); } catch { error = 'storage'; }
    persist(); notify(true);
    await sync();
    if (intent !== connectionIntent) throw new Error('superseded');
    if (seed) { merge(seed); await sync(); }
    return status();
  }
  async function create(seed) {
    const intent = ++connectionIntent;
    const result = await request('/api/sync/create', { code: null, method: 'POST', body: {} });
    if (intent !== connectionIntent) throw new Error('superseded');
    await connect(result.code, seed);
    return result.code;
  }
  function merge(progress) {
    if (!active) return;
    // Importing a snapshot is not permission to replace an unsynced edit or a
    // conflict draft. Reject before mutating any field; the caller retains the
    // import file and can retry after resolving/syncing those drafts.
    for (const [id, p] of Object.entries(progress || {})) {
      if (!p || typeof p !== 'object') continue;
      for (const field of FIELDS) {
        if (!(field in p)) continue;
        const k = key(id, field), draft = data.conflicts[k]?.local ?? data.pending[k]?.value;
        if ((data.conflicts[k] || data.pending[k]) && JSON.stringify(draft) !== JSON.stringify(p[field])) throw new Error('pending');
      }
    }
    for (const [id, p] of Object.entries(progress || {})) {
      if (!p || typeof p !== 'object') continue;
      const changes = {};
      for (const field of FIELDS) {
        if (!(field in p)) continue;
        const k = key(id, field), current = data.cards[id]?.[field];
        if (data.pending[k] || data.conflicts[k]) continue;
        if (current === undefined) changes[field] = p[field];
        else if (JSON.stringify(current) !== JSON.stringify(p[field])) {
          data.conflicts[k] = { cardId: id, field, local: clone(p[field]), remote: clone(current), record: { cardId: id, field, value: clone(current), version: data.versions[k] || 0 } };
          delete data.pending[k];
        }
      }
      if (Object.keys(changes).length) patch(id, changes);
    }
    persist(); notify(true); schedule();
  }
  function resolve(k, choice) {
    const conflict = data.conflicts[k]; if (!conflict) return;
    delete data.conflicts[k];
    data.versions[k] = conflict.record?.version || 0;
    const value = choice === 'local' ? conflict.local : conflict.remote;
    if (choice === 'local') patch(conflict.cardId, { [conflict.field]: value });
    else if (value === null && !conflict.record) delete data.cards[conflict.cardId]?.[conflict.field];
    else data.cards[conflict.cardId] = { ...data.cards[conflict.cardId], [conflict.field]: value };
    persist(); notify(true);
  }
  function disconnect() {
    persist(); epoch++; connectionIntent++; active = null; data = empty(); busy = false; error = ''; clearTimeout(timer);
    try { localStorage.removeItem(ACTIVE); } catch { error = 'storage'; }
    notify(); hooks.onDisconnect?.();
  }
  function init(options) {
    hooks = options || {}; active = read(ACTIVE, null);
    if (active?.code && active?.vaultId) { data = cached(active.vaultId); notify(true); sync(); }
    else active = null;
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
    return status();
  }
  root.AtlasSync = { init, patch, sync, connect, create, merge, resolve, disconnect, status, code: () => active?.code || '', FIELDS };
})(typeof window !== 'undefined' ? window : globalThis);
