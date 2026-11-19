import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  institution: text("institution").notNull().default("other"), // nubank | inter | itau | bradesco | bb | c6 | santander | xp | btg | caixa | other
  type: text("type").notNull().default("checking"), // checking | savings | credit_card | investment | cash
  initialBalanceCents: integer("initial_balance_cents").notNull().default(0),
  color: text("color").notNull().default("#22D3EE"),
  closingDay: integer("closing_day"),
  dueDay: integer("due_day"),
  isArchived: integer("is_archived").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: text("type").notNull().default("expense"), // expense | income | transfer
  icon: text("icon").notNull().default("Tag"),
  color: text("color").notNull().default("#22D3EE"),
  monthlyBudgetCents: integer("monthly_budget_cents"),
  isSystem: integer("is_system").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedKey: text("normalized_key").notNull().unique(),
  defaultCategoryId: text("default_category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull(),
});

export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(), // ofx | csv | pdf
  fileHash: text("file_hash").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  importedCount: integer("imported_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    importBatchId: text("import_batch_id").references(() => importBatches.id, {
      onDelete: "cascade",
    }),
    date: text("date").notNull(), // YYYY-MM-DD
    competenceDate: text("competence_date").notNull(), // YYYY-MM-DD
    amountCents: integer("amount_cents").notNull(), // Positive = Income, Negative = Expense
    type: text("type").notNull().default("expense"), // expense | income | transfer
    rawDescription: text("raw_description").notNull(),
    cleanDescription: text("clean_description").notNull(),
    merchantName: text("merchant_name"),
    installmentCurrent: integer("installment_current"),
    installmentTotal: integer("installment_total"),
    externalId: text("external_id"),
    dedupHash: text("dedup_hash").notNull(),
    classificationSource: text("classification_source").notNull().default("uncategorized"), // manual | rule | history | ai | uncategorized
    confidenceScore: real("confidence_score").notNull().default(0),
    isReviewed: integer("is_reviewed").notNull().default(0),
    isRecurring: integer("is_recurring").notNull().default(0),
    isIgnored: integer("is_ignored").notNull().default(0),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_transactions_date").on(table.date),
    index("idx_transactions_category").on(table.categoryId),
    index("idx_transactions_account").on(table.accountId),
    index("idx_transactions_dedup").on(table.dedupHash),
    index("idx_transactions_batch").on(table.importBatchId),
  ]
);

export const categorizationRules = sqliteTable("categorization_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  matchType: text("match_type").notNull().default("contains"), // contains | regex | starts_with | exact
  pattern: text("pattern").notNull(),
  minAmountCents: integer("min_amount_cents"),
  maxAmountCents: integer("max_amount_cents"),
  targetCategoryId: text("target_category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  targetMerchantName: text("target_merchant_name"),
  priority: integer("priority").notNull().default(100),
  isActive: integer("is_active").notNull().default(1),
  hitCount: integer("hit_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const csvPresets = sqliteTable("csv_presets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  institution: text("institution").notNull().default("custom"),
  dateColumn: text("date_column").notNull(),
  descriptionColumn: text("description_column").notNull(),
  amountColumn: text("amount_column").notNull(),
  creditColumn: text("credit_column"),
  debitColumn: text("debit_column"),
  categoryColumn: text("category_column"),
  dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
  delimiter: text("delimiter").notNull().default(","),
  invertSignal: integer("invert_signal").notNull().default(0),
  isSystem: integer("is_system").notNull().default(0),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Merchant = typeof merchants.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type CategorizationRule = typeof categorizationRules.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type CsvPreset = typeof csvPresets.$inferSelect;

