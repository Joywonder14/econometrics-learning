/** Pure request/data logic, shared by Worker routes and SQLite-backed tests.
 * Identity comes exclusively from a bearer capability or configured admin secret. No platform
 * user headers, client-supplied vault IDs, emails, or account IDs are consulted.
 */
export const FIELDS = ["seenAt", "bookmark", "note", "quizChoice", "quizCorrect", "memory"] as const;
export type Field = typeof FIELDS[number];
export type Patch = { cardId: string; field: Field; value: unknown; baseVersion: number; opId: string };
export type FieldRecord = { cardId: string; field: Field; value: unknown; version: number; updatedAt: string; opId: string };
type DbRow = { card_id: string; field: Field; value: string; version: number; updated_at: string; op_id: string };
type Vault = { id: string; created_at: string; role: "admin" | "learner"; display_id: string };
export type Dependencies = { getDB: () => D1Database; getAdminCode?: () => string | undefined; now?: () => number };
const MAX_BODY_BYTES = 2_000_000;
const MAX_DATE = 8_640_000_000_000_000;
const PHASES = new Set(["learning", "review", "relearning"]);
const RATINGS = new Set(["again", "hard", "good", "easy"]);
const CODE_PATTERN = /^EA1-[A-Za-z0-9_-]{43}$/;
const RETURN_COLUMNS = "card_id, field, value, version, updated_at, op_id";

class InvalidRequest extends Error {}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keysOnly(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}
function numberBetween(value: unknown, min: number, max: number, integer = false): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
}
function timestamp(value: unknown) { return numberBetween(value, 0, MAX_DATE); }
function shortString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}
function validDateString(value: unknown) {
  if (typeof value !== "string" || value.length > 35) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function validMemory(value: unknown): boolean {
  if (!object(value) || !keysOnly(value, ["version", "stability", "difficulty", "lastReviewAt", "dueAt", "phase", "reps", "lapses", "history", "sessionId"])) return false;
  if (value.version !== 2 || !numberBetween(value.stability, .05, 3650) || !numberBetween(value.difficulty, 1, 10)) return false;
  if (!timestamp(value.lastReviewAt) || !timestamp(value.dueAt) || !PHASES.has(String(value.phase))) return false;
  if (!numberBetween(value.reps, 0, 1_000_000, true) || !numberBetween(value.lapses, 0, 1_000_000, true) || !shortString(value.sessionId, 100)) return false;
  if (!Array.isArray(value.history) || value.history.length > 40) return false;
  return value.history.every((entry: unknown) => {
    if (!object(entry) || !keysOnly(entry, ["at", "rating", "quizCorrect", "elapsedDays", "stability", "difficulty", "intervalDays", "phase", "sessionId"])) return false;
    return timestamp(entry.at) && RATINGS.has(String(entry.rating)) &&
      (entry.quizCorrect === null || typeof entry.quizCorrect === "boolean") &&
      numberBetween(entry.elapsedDays, 0, 365000) && numberBetween(entry.stability, .05, 3650) &&
      numberBetween(entry.difficulty, 1, 10) && numberBetween(entry.intervalDays, 0, 3650) &&
      PHASES.has(String(entry.phase)) && shortString(entry.sessionId, 100);
  });
}

export function validatePatches(body: unknown): Patch[] {
  if (!object(body) || !keysOnly(body, ["patches"]) || !Array.isArray(body.patches) || body.patches.length < 1 || body.patches.length > 100) throw new InvalidRequest("Expected 1–100 patches");
  const targets = new Set<string>();
  return body.patches.map((item: unknown) => {
    if (!object(item) || !keysOnly(item, ["cardId", "field", "value", "baseVersion", "opId"])) throw new InvalidRequest("Invalid patch");
    if (typeof item.cardId !== "string" || item.cardId.length > 64 || !/^[a-z][a-z0-9]*-c\d+$/.test(item.cardId)) throw new InvalidRequest("Invalid card ID");
    if (!FIELDS.includes(item.field as Field)) throw new InvalidRequest("Invalid field");
    if (!numberBetween(item.baseVersion, 0, Number.MAX_SAFE_INTEGER - 1, true)) throw new InvalidRequest("Invalid version");
    if (typeof item.opId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(item.opId)) throw new InvalidRequest("Invalid operation ID");
    const field = item.field as Field;
    const valid = field === "memory" ? validMemory(item.value) :
      field === "note" ? shortString(item.value, 50_000) :
      field === "seenAt" ? validDateString(item.value) :
      field === "quizChoice" ? numberBetween(item.value, 0, 9, true) :
      typeof item.value === "boolean";
    if (!valid) throw new InvalidRequest("Invalid field value");
    const target = item.cardId + ":" + field;
    if (targets.has(target)) throw new InvalidRequest("Repeated field in batch");
    targets.add(target);
    return { cardId: item.cardId, field, value: item.value, baseVersion: item.baseVersion, opId: item.opId };
  });
}

export function jsonResponse(value: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff", ...extra,
  } });
}
function sameOriginJSON(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new InvalidRequest("Same-origin request required");
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new InvalidRequest("JSON content type required");
}
async function readJSON(request: Request, limit = MAX_BODY_BYTES): Promise<unknown> {
  const size = request.headers.get("content-length");
  if (size && Number(size) > limit) throw new InvalidRequest("Body too large");
  if (!request.body) throw new InvalidRequest("JSON body required");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new InvalidRequest("Body too large"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new InvalidRequest("Invalid JSON"); }
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function bearer(request: Request) {
  const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]{1,128})$/i);
  return match?.[1] || null;
}
async function sourceKey(request: Request) {
  return hash(request.headers.get("cf-connecting-ip") || "unknown-source");
}
// Digests always have the same length; compare all bytes without early exits.
async function matchesAdmin(candidate: string, secret: string) {
  const digests = await Promise.all([candidate, secret].map((value) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
  const a = new Uint8Array(digests[0]), b = new Uint8Array(digests[1]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
async function authenticate(request: Request, deps: Dependencies): Promise<{ db: D1Database; vault: Vault } | Response> {
  const db = deps.getDB(), nowMs = (deps.now || Date.now)();
  const windowStart = Math.floor(nowMs / 900_000) * 900_000;
  const scope = "auth:" + await sourceKey(request);
  // Reserve an attempt atomically before testing any candidate, so concurrent
  // requests cannot all pass a read-only limit check. Successful auth clears it.
  const attempted = await db.batch<{ hits: number }>([
    db.prepare("DELETE FROM sync_rate_limits WHERE scope_key LIKE 'auth:%' AND window_start < ?").bind(windowStart - 86_400_000),
    db.prepare(`INSERT INTO sync_rate_limits(scope_key,window_start,hits,request_id) VALUES (?,?,1,'')
      ON CONFLICT(scope_key) DO UPDATE SET window_start=excluded.window_start,
      hits=CASE WHEN sync_rate_limits.window_start<>excluded.window_start THEN 1 ELSE sync_rate_limits.hits+1 END
      WHERE sync_rate_limits.window_start<>excluded.window_start OR sync_rate_limits.hits<10
      RETURNING hits`).bind(scope, windowStart),
  ]);
  if (attempted.some((r) => !r.success)) throw new Error("Rate limit unavailable");
  const retry = String(Math.max(1, Math.ceil((windowStart + 900_000 - nowMs) / 1000)));
  const attempts = attempted[1].results[0]?.hits;
  if (!attempts) return jsonResponse({ error: "Too many failed sync-code attempts. Try again later." }, 429, { "Retry-After": retry });
  const candidate = bearer(request);
  let vault: Vault | null = null;
  const adminSecret = deps.getAdminCode?.();
  if (candidate && adminSecret && await matchesAdmin(candidate, adminSecret)) {
    // Admin progress is a separate vault, never a permission to read other vaults.
    // Only a successful use of the configured secret lazily creates this vault.
    const result = await db.prepare(`INSERT INTO sync_vaults(id,token_hash,created_at,role,display_id)
      VALUES ('admin',?,?,'admin','admin') ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash
      RETURNING id,created_at,role,display_id`).bind(await hash(candidate), new Date(nowMs).toISOString()).all<Vault>();
    if (!result.success) throw new Error("Vault unavailable");
    vault = result.results[0] || null;
  } else if (candidate && CODE_PATTERN.test(candidate)) {
    vault = await db.prepare("SELECT id,created_at,role,display_id FROM sync_vaults WHERE token_hash=? AND role='learner'").bind(await hash(candidate)).first<Vault>();
  }
  if (vault) {
    await db.prepare("DELETE FROM sync_rate_limits WHERE scope_key=?").bind(scope).run();
    return { db, vault };
  }
  return attempts >= 10
    ? jsonResponse({ error: "Too many failed sync-code attempts. Try again later." }, 429, { "Retry-After": retry })
    : jsonResponse({ error: "Invalid sync code" }, 401);
}
function unpack(row: DbRow): FieldRecord {
  return { cardId: row.card_id, field: row.field, value: JSON.parse(row.value), version: row.version, updatedAt: row.updated_at, opId: row.op_id };
}
function unavailable() { return jsonResponse({ error: "Sync is temporarily unavailable" }, 503); }

export async function handleSession(request: Request, deps: Dependencies) {
  if (!request.headers.has("authorization")) return jsonResponse({ connected: false });
  try {
    const auth = await authenticate(request, deps);
    if (auth instanceof Response) return auth;
    const { vault } = auth;
    return jsonResponse({ connected: true, vaultId: vault.id, createdAt: vault.created_at, role: vault.role, displayId: vault.display_id });
  } catch { return unavailable(); }
}

export async function handleGetProgress(request: Request, deps: Dependencies) {
  if (!request.headers.has("authorization")) return jsonResponse({ error: "Sync code required" }, 401);
  try {
    const auth = await authenticate(request, deps);
    if (auth instanceof Response) return auth;
    const { db, vault } = auth;
    const result = await db.prepare(`SELECT ${RETURN_COLUMNS} FROM study_fields WHERE vault_id = ? ORDER BY card_id, field`).bind(vault.id).all<DbRow>();
    if (!result.success) return unavailable();
    return jsonResponse({ records: result.results.map(unpack) });
  } catch { return unavailable(); }
}

// The INSERT predicate allows a new row only at version zero. Existing rows
// take the conditional UPDATE path, which checks the actual database version
// inside the same atomic SQL statement (never a read-then-write in JavaScript).
const UPSERT = `INSERT INTO study_fields (vault_id,card_id,field,value,version,updated_at,op_id)
 SELECT ?,?,?,?,1,?,? WHERE ? = 0 OR EXISTS (
   SELECT 1 FROM study_fields WHERE vault_id=? AND card_id=? AND field=?
 )
 ON CONFLICT(vault_id,card_id,field) DO UPDATE SET
 value=excluded.value,version=study_fields.version+1,updated_at=excluded.updated_at,op_id=excluded.op_id
 WHERE study_fields.version=? AND study_fields.op_id<>excluded.op_id
 RETURNING ${RETURN_COLUMNS}`;

export async function handlePostProgress(request: Request, deps: Dependencies) {
  if (!request.headers.has("authorization")) return jsonResponse({ error: "Sync code required" }, 401);
  try {
    sameOriginJSON(request);
    const auth = await authenticate(request, deps);
    if (auth instanceof Response) return auth;
    const { db, vault } = auth;
    const patches = validatePatches(await readJSON(request));
    const now = new Date((deps.now || Date.now)()).toISOString();
    const statements = patches.flatMap((p) => [
      db.prepare(UPSERT).bind(vault.id, p.cardId, p.field, JSON.stringify(p.value), now, p.opId, p.baseVersion, vault.id, p.cardId, p.field, p.baseVersion),
      db.prepare(`SELECT ${RETURN_COLUMNS} FROM study_fields WHERE vault_id=? AND card_id=? AND field=?`).bind(vault.id, p.cardId, p.field),
    ]);
    // D1 batch executes these statements as a transaction. Each SELECT observes
    // its matching mutation before another request can change that snapshot.
    const executed = await db.batch<DbRow>(statements);
    if (executed.some((r) => !r.success)) return unavailable();
    const results = patches.map((p, i) => {
      const changed = executed[i * 2].results[0];
      const current = changed || executed[i * 2 + 1].results[0];
      return { cardId: p.cardId, field: p.field, opId: p.opId,
        status: changed ? "applied" : current?.op_id === p.opId ? "duplicate" : "conflict",
        record: current ? unpack(current) : null,
      };
    });
    return jsonResponse({ results });
  } catch (error) {
    return error instanceof InvalidRequest ? jsonResponse({ error: error.message }, 400) : unavailable();
  }
}

export async function handleCreateVault(request: Request, deps: Dependencies) {
  try {
    sameOriginJSON(request);
    const body = await readJSON(request, 1024);
    if (!object(body) || Object.keys(body).length !== 0) throw new InvalidRequest("Expected an empty JSON object");
    const db = deps.getDB(), nowMs = (deps.now || Date.now)();
    const hour = Math.floor(nowMs / 3_600_000) * 3_600_000;
    const day = Math.floor(nowMs / 86_400_000) * 86_400_000;
    // Cloudflare's connecting-IP header is used only for bounded abuse control,
    // never identity or progress authorization; absent preview headers share a bucket.
    const source = "create:" + await hash(request.headers.get("cf-connecting-ip") || "unknown-source");
    const requestId = crypto.randomUUID(), vaultId = crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const code = "EA1-" + btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const tokenHash = await hash(code), createdAt = new Date(nowMs).toISOString();
    const batch = await db.batch([
      db.prepare("DELETE FROM sync_rate_limits WHERE scope_key LIKE 'create:%' AND window_start < ?").bind(hour - 172_800_000),
      db.prepare(`INSERT INTO sync_rate_limits (scope_key,window_start,hits,request_id)
        SELECT ?,?,1,? WHERE NOT EXISTS (SELECT 1 FROM sync_rate_limits WHERE scope_key='global' AND window_start=? AND hits>=30)
        ON CONFLICT(scope_key) DO UPDATE SET window_start=excluded.window_start,
        hits=CASE WHEN sync_rate_limits.window_start<>excluded.window_start THEN 1 ELSE sync_rate_limits.hits+1 END,
        request_id=excluded.request_id
        WHERE sync_rate_limits.window_start<>excluded.window_start OR sync_rate_limits.hits<3`)
        .bind(source, hour, requestId, day),
      db.prepare(`INSERT INTO sync_rate_limits (scope_key,window_start,hits,request_id)
        SELECT 'global',?,1,? WHERE EXISTS (SELECT 1 FROM sync_rate_limits WHERE scope_key=? AND request_id=?)
        ON CONFLICT(scope_key) DO UPDATE SET window_start=excluded.window_start,
        hits=CASE WHEN sync_rate_limits.window_start<>excluded.window_start THEN 1 ELSE sync_rate_limits.hits+1 END,
        request_id=excluded.request_id
        WHERE sync_rate_limits.window_start<>excluded.window_start OR sync_rate_limits.hits<30`)
        .bind(day, requestId, source, requestId),
      db.prepare(`INSERT INTO sync_vaults(id,token_hash,created_at,role,display_id)
        SELECT ?,?,?,'learner',? WHERE EXISTS (SELECT 1 FROM sync_rate_limits WHERE scope_key='global' AND request_id=?)
        AND EXISTS (SELECT 1 FROM sync_rate_limits WHERE scope_key=? AND request_id=?) RETURNING id`)
        .bind(vaultId, tokenHash, createdAt, vaultId.slice(0, 8), requestId, source, requestId),
    ]);
    if (batch.some((r) => !r.success)) return unavailable();
    if (!batch[3].results.length) return jsonResponse({ error: "Too many sync-code requests. Try again later." }, 429, { "Retry-After": "3600" });
    return jsonResponse({ code, createdAt }, 201);
  } catch (error) {
    return error instanceof InvalidRequest ? jsonResponse({ error: error.message }, 400) : unavailable();
  }
}
