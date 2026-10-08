import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// A capability vault has no relationship to a ChatGPT/OpenAI identity.
// Only a SHA-256 digest of its bearer secret is persisted.
export const syncVaults = sqliteTable("sync_vaults", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: text("created_at").notNull(),
  role: text("role").notNull().default("learner"),
  displayId: text("display_id").notNull(),
});

export const studyFields = sqliteTable("study_fields", {
  vaultId: text("vault_id").notNull().references(() => syncVaults.id, { onDelete: "cascade" }),
  cardId: text("card_id").notNull(),
  field: text("field").notNull(),
  value: text("value").notNull(),
  version: integer("version").notNull(),
  updatedAt: text("updated_at").notNull(),
  opId: text("op_id").notNull(),
}, (table) => [primaryKey({ columns: [table.vaultId, table.cardId, table.field] })]);

// Bounded creation/authentication counters; source keys are hashes, never raw IP addresses.
export const syncRateLimits = sqliteTable("sync_rate_limits", {
  scopeKey: text("scope_key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  hits: integer("hits").notNull(),
  requestId: text("request_id").notNull(),
});
