import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { handleSession, handleGetProgress, handlePostProgress, handleCreateVault, validatePatches, validMemory } from '../app/api/progress/service.ts';

const ORIGIN = 'https://atlas.example.test';
// Test-only secret; production configuration is supplied outside source control.
const TEST_ADMIN = 'test-admin-secret';
const migrations = readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => /^\d+.*\.sql$/.test(n)).sort();
const migrationSQL = migrations.map(n => readFileSync(new URL('../drizzle/' + n, import.meta.url), 'utf8')).join('\n');

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(migrationSQL);
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    execute() { return { success: true, results: sqlite.prepare(this.sql).all(...this.args) }; }
    async all() { return this.execute(); }
    async first() { return this.execute().results[0] ?? null; }
    async run() { return this.execute(); }
  }
  const db = {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const rows = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return rows; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  let time = Date.UTC(2026, 9, 8, 12), admin = TEST_ADMIN;
  return { sqlite, deps: { getDB: () => db, now: () => time, getAdminCode: () => admin },
    advance(ms) { time += ms; }, setAdmin(code) { admin = code; } };
}
function request(path, { method = 'GET', code, body, ip = '192.0.2.1', headers = {} } = {}) {
  return new Request(ORIGIN + path, { method, headers: {
    'cf-connecting-ip': ip, ...(code ? { Authorization: 'Bearer ' + code } : {}),
    ...(body !== undefined ? { Origin: ORIGIN, 'Content-Type': 'application/json' } : {}), ...headers,
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function create(ctx, ip = '192.0.2.1') {
  const response = await handleCreateVault(request('/api/sync/create', { method: 'POST', body: {}, ip }), ctx.deps);
  assert.equal(response.status, 201);
  assert.match(response.headers.get('cache-control'), /no-store/);
  return (await response.json()).code;
}
const patch = (value = 'note', more = {}) => ({ cardId: 'm01-c01', field: 'note', value, baseVersion: 0, opId: crypto.randomUUID(), ...more });
async function post(ctx, code, patches, options = {}) {
  return handlePostProgress(request('/api/progress', { method: 'POST', code, body: { patches }, ...options }), ctx.deps);
}
async function records(ctx, code) {
  const r = await handleGetProgress(request('/api/progress', { code }), ctx.deps);
  assert.equal(r.status, 200);
  return (await r.json()).records;
}

test('anonymous session is offline; progress needs capability; OpenAI headers never authorize', async () => {
  const ctx = setup();
  assert.deepEqual(await (await handleSession(request('/api/session'), ctx.deps)).json(), { connected: false });
  const r = await handleGetProgress(request('/api/progress', { headers: { 'x-openai-user-id': 'admin', 'x-chatgpt-user-id': 'admin' } }), ctx.deps);
  assert.equal(r.status, 401);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.equal((await handleSession(request('/api/session', { code: 'unknown' }), ctx.deps)).status, 401);
  assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM sync_vaults').get().n, 0);
});

test('random vault returns 256-bit code once and stores only its hash', async () => {
  const ctx = setup(), code = await create(ctx);
  assert.match(code, /^EA1-[A-Za-z0-9_-]{43}$/);
  const row = ctx.sqlite.prepare('SELECT * FROM sync_vaults').get();
  assert.equal(row.token_hash, createHash('sha256').update(code).digest('hex'));
  assert.ok(!JSON.stringify(row).includes(code));
  const session = await (await handleSession(request('/api/session', { code }), ctx.deps)).json();
  assert.equal(session.connected, true);
  assert.equal(session.role, 'learner');
  assert.equal(session.vaultId, row.id);
  assert.equal(session.displayId, row.id.slice(0, 8));
});

test('vault isolation includes admin; rotating secret preserves admin progress and revokes old code', async () => {
  const ctx = setup(), a = await create(ctx), b = await create(ctx, '192.0.2.2');
  await post(ctx, a, [patch('A')]);
  await post(ctx, b, [patch('B')]);
  assert.equal((await records(ctx, a))[0].value, 'A');
  assert.equal((await records(ctx, b))[0].value, 'B');
  const admin = await (await handleSession(request('/api/session', { code: TEST_ADMIN }), ctx.deps)).json();
  assert.equal(admin.role, 'admin');
  assert.equal(admin.displayId, 'admin');
  assert.deepEqual(await records(ctx, TEST_ADMIN), []);
  await post(ctx, TEST_ADMIN, [patch('ADMIN')]);
  assert.equal((await records(ctx, a))[0].value, 'A');
  ctx.setAdmin('test-rotated-secret');
  assert.equal((await handleSession(request('/api/session', { code: TEST_ADMIN }), ctx.deps)).status, 401);
  assert.equal((await records(ctx, 'test-rotated-secret'))[0].value, 'ADMIN');
  assert.equal(ctx.sqlite.prepare("SELECT count(*) n FROM sync_vaults WHERE role='admin'").get().n, 1);
});

test('atomic CAS accepts one concurrent change and returns other as conflict; retry is duplicate', async () => {
  const ctx = setup(), code = await create(ctx);
  const first = patch('initial');
  assert.equal((await (await post(ctx, code, [first])).json()).results[0].status, 'applied');
  const changes = [patch('device A', { baseVersion: 1 }), patch('device B', { baseVersion: 1 })];
  const replies = await Promise.all(changes.map(async p => (await (await post(ctx, code, [p])).json()).results[0]));
  assert.deepEqual(replies.map(r => r.status).sort(), ['applied', 'conflict']);
  const winner = replies.find(r => r.status === 'applied');
  assert.equal(winner.record.version, 2);
  assert.equal(replies.find(r => r.status === 'conflict').record.value, winner.record.value);
  const retry = (await (await post(ctx, code, [changes.find(p => p.opId === winner.opId)])).json()).results[0];
  assert.equal(retry.status, 'duplicate');
  assert.equal(retry.record.version, 2);
  const absent = (await (await post(ctx, code, [patch('never insert', { cardId: 'm01-c02', baseVersion: 7 })])).json()).results[0];
  assert.equal(absent.status, 'conflict'); assert.equal(absent.record, null);
  assert.equal((await records(ctx, code)).length, 1);
});

test('independent fields update without conflict and mixed invalid batch writes nothing', async () => {
  const ctx = setup(), code = await create(ctx);
  const response = await post(ctx, code, [patch('note'), patch(true, { field: 'bookmark' })]);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).results.map(r => r.status), ['applied', 'applied']);
  const bad = await post(ctx, code, [patch('do not save', { cardId: 'm02-c01' }), patch('<script>', { field: 'bookmark' })]);
  assert.equal(bad.status, 400);
  assert.equal((await records(ctx, code)).length, 2);
});

test('schema rejects malformed dates, invalid field types, oversized and duplicate patches', () => {
  const invalid = [patch(3), patch(false, { field: 'note' }), patch('', { cardId: '../secret' }),
    patch('2026-02-30', { field: 'seenAt' }), patch('2026-02-30T12:00:00Z', { field: 'seenAt' }),
    patch(-1, { field: 'quizChoice' }), patch(10, { field: 'quizChoice' }), patch(true, { baseVersion: -1 }),
    patch('x', { opId: ' ' }), patch('x'.repeat(50001)), patch(null, { field: 'memory' }),
    { ...patch(), vaultId: 'other' }];
  invalid.forEach(p => assert.throws(() => validatePatches({ patches: [p] })));
  assert.throws(() => validatePatches({ patches: [patch(), patch()] }));
  assert.throws(() => validatePatches({ patches: Array.from({ length: 101 }, (_, i) => patch('x', { cardId: 'm01-c' + i })) }));
  assert.equal(validatePatches({ patches: Array.from({ length: 100 }, (_, i) => patch('x', { cardId: 'm01-c' + i })) }).length, 100);
  assert.equal(validatePatches({ patches: [patch('2026-02-28', { field: 'seenAt' })] }).length, 1);
});

test('actual review-engine output validates and round trips as an atomic value', async () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL('../public/review-engine.js', import.meta.url), 'utf8'), context);
  const engine = context.AtlasReview;
  let memory = engine.rate(null, 'good', Date.UTC(2026, 9, 1), 'session1', true);
  for (let i = 0; i < 45; i++) memory = engine.rate(memory, ['again','hard','good','easy'][i % 4], memory.dueAt + 86400000, 'session' + i, true);
  memory = JSON.parse(JSON.stringify(memory));
  assert.ok(validMemory(memory));
  assert.ok(memory.history.length <= 40);
  assert.ok(!validMemory({ ...memory, dueAt: Infinity }));
  assert.ok(!validMemory({ ...memory, history: [...memory.history, memory.history[0]] }));
  assert.ok(!validMemory({ ...memory, secret: 'unsupported' }));
  const ctx = setup(), code = await create(ctx);
  assert.equal((await post(ctx, code, [patch(memory, { field: 'memory' })])).status, 200);
  assert.deepEqual((await records(ctx, code))[0].value, memory);
});

test('POST requires same Origin, JSON and bounded body', async () => {
  const ctx = setup(), code = await create(ctx);
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: '' }, { 'Content-Type': 'text/plain' }]) {
    assert.equal((await post(ctx, code, [patch()], { headers })).status, 400);
  }
  const oversized = request('/api/progress', { method: 'POST', code, body: { patches: [patch('x'.repeat(2000001))] } });
  assert.equal((await handlePostProgress(oversized, ctx.deps)).status, 400);
  assert.equal((await handleCreateVault(request('/api/sync/create', { method: 'POST', body: { vaultId: 'admin' } }), ctx.deps)).status, 400);
  assert.deepEqual(await records(ctx, code), []);
});

test('creation is limited per source and globally without unbounded rejected source rows', async () => {
  const ctx = setup();
  await create(ctx); await create(ctx); await create(ctx);
  assert.equal((await handleCreateVault(request('/api/sync/create', { method: 'POST', body: {} }), ctx.deps)).status, 429);
  for (let i = 0; i < 27; i++) await create(ctx, '198.51.100.' + i);
  const blocked = await handleCreateVault(request('/api/sync/create', { method: 'POST', body: {}, ip: '203.0.113.222' }), ctx.deps);
  assert.equal(blocked.status, 429);
  assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM sync_vaults').get().n, 30);
  assert.equal(ctx.sqlite.prepare("SELECT count(*) n FROM sync_rate_limits WHERE scope_key LIKE 'create:%'").get().n, 28);
  ctx.advance(86400000);
  await create(ctx);
});

test('failed code quota is atomic under concurrent attempts, source-specific and expires', async () => {
  const ctx = setup();
  const replies = await Promise.all(Array.from({ length: 20 }, () => handleSession(request('/api/session', { code: 'incorrect' }), ctx.deps)));
  assert.equal(replies.filter(r => r.status === 401).length, 9);
  assert.equal(replies.filter(r => r.status === 429).length, 11);
  const blocked = await handleSession(request('/api/session', { code: TEST_ADMIN }), ctx.deps);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '900');
  assert.equal((await handleSession(request('/api/session', { code: TEST_ADMIN, ip: '192.0.2.3' }), ctx.deps)).status, 200);
  ctx.advance(900000);
  assert.equal((await handleSession(request('/api/session', { code: TEST_ADMIN }), ctx.deps)).status, 200);
});

test('dependency failures are 503 without exposing exception details or secrets', async () => {
  const deps = { getDB() { throw Error('sensitive internal details'); } };
  const response = await handleGetProgress(request('/api/progress', { code: 'some-code' }), deps);
  assert.equal(response.status, 503);
  assert.equal(await response.text(), '{"error":"Sync is temporarily unavailable"}');
  assert.match(response.headers.get('cache-control'), /no-store/);
});
