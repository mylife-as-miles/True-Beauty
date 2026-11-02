import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const hostedBudgets = sqliteTable(
  "tb_hosted_budgets",
  {
    id: text("id").primaryKey(),
    creditsUsed: integer("credits_used").notNull(),
    creditsLimit: integer("credits_limit").notNull(),
    usdMicroUsed: integer("usd_micro_used").notNull(),
    usdMicroLimit: integer("usd_micro_limit").notNull(),
    initializedAt: integer("initialized_at").notNull(),
    initializedByHash: text("initialized_by_hash").notNull(),
  },
  (table) => [
    check(
      "hosted_budget_credit_bounds",
      sql`${table.creditsUsed} >= 51 AND ${table.creditsUsed} <= ${table.creditsLimit} AND ${table.creditsLimit} <= 100`,
    ),
    check(
      "hosted_budget_usd_bounds",
      sql`${table.usdMicroUsed} >= 111000 AND ${table.usdMicroUsed} <= ${table.usdMicroLimit} AND ${table.usdMicroLimit} <= 5000000`,
    ),
  ],
);
export const hostedRecords = sqliteTable(
  "tb_hosted_records",
  {
    namespace: text("namespace").notNull(),
    id: text("id").notNull(),
    ownerHash: text("owner_hash").notNull(),
    revision: integer("revision").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    iv: text("iv").notNull(),
    ciphertext: text("ciphertext").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.namespace, table.id] }),
    index("hosted_records_owner").on(
      table.namespace,
      table.ownerHash,
      table.expiresAt,
    ),
    index("hosted_records_expiry").on(table.expiresAt),
    check("hosted_record_revision", sql`${table.revision} > 0`),
    check(
      "hosted_record_retention",
      sql`${table.expiresAt} <= ${table.createdAt} + 900000 AND ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
export const hostedQuotes = sqliteTable(
  "tb_hosted_quotes",
  {
    id: text("id").primaryKey(),
    ownerHash: text("owner_hash").notNull(),
    operation: text("operation").notNull(),
    termsHash: text("terms_hash").notNull(),
    credits: integer("credits").notNull(),
    usdMicro: integer("usd_micro").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    iv: text("iv").notNull(),
    ciphertext: text("ciphertext").notNull(),
    consumedBy: text("consumed_by"),
    recordNamespace: text("record_namespace"),
    continuationExpiresAt: integer("continuation_expires_at"),
    approvedAt: integer("approved_at"),
    approvedByHash: text("approved_by_hash"),
    approvalExpiresAt: integer("approval_expires_at"),
    revokedAt: integer("revoked_at"),
    revokedByHash: text("revoked_by_hash"),
  },
  (table) => [
    index("hosted_quotes_owner").on(table.ownerHash, table.expiresAt),
    index("hosted_quotes_pending").on(table.consumedBy, table.expiresAt),
    check(
      "hosted_quote_units",
      sql`${table.credits} >= 0 AND ${table.credits} <= 100 AND ${table.usdMicro} >= 0 AND ${table.usdMicro} <= 5000000`,
    ),
    check(
      "hosted_quote_operation",
      sql`${table.operation} IN ('skin','hair','clothing','reasoning')`,
    ),
    check(
      "hosted_quote_retention",
      sql`${table.expiresAt} <= ${table.createdAt} + 900000 AND ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);
export const hostedReservations = sqliteTable(
  "tb_hosted_reservations",
  {
    id: text("id").primaryKey(),
    quoteId: text("quote_id").notNull(),
    ownerHash: text("owner_hash").notNull(),
    budgetId: text("budget_id").notNull(),
    operation: text("operation").notNull(),
    termsHash: text("terms_hash").notNull(),
    credits: integer("credits").notNull(),
    usdMicro: integer("usd_micro").notNull(),
    createdAt: integer("created_at").notNull(),
    recordNamespace: text("record_namespace").notNull(),
    recordId: text("record_id").notNull(),
    recordExpiresAt: integer("record_expires_at").notNull(),
    operatorAuthorized: integer("operator_authorized").notNull(),
  },
  (table) => [
    uniqueIndex("hosted_reservation_quote_once").on(table.quoteId),
    index("hosted_reservation_owner").on(
      table.ownerHash,
      table.recordExpiresAt,
    ),
    check(
      "hosted_reservation_operator",
      sql`${table.operatorAuthorized} IN (0,1)`,
    ),
  ],
);
export const hostedRateLimits = sqliteTable(
  "tb_hosted_rate_limits",
  {
    keyHash: text("key_hash").primaryKey(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [
    index("hosted_rate_expiry").on(table.expiresAt),
    check("hosted_rate_count", sql`${table.count} > 0`),
  ],
);
/** AUTOINCREMENT sequence survives deletion of transient rows, preventing CAS ABA after expiry. */
export const hostedEpochs = sqliteTable(
  "tb_hosted_epochs",
  { id: integer("id").primaryKey({ autoIncrement: true }) },
  (table) => [
    check(
      "hosted_epoch_safe_integer",
      sql`${table.id} > 0 AND ${table.id} <= 9007199254740991`,
    ),
  ],
);
