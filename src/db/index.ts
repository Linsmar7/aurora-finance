import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import { DEFAULT_CATEGORIES, DEFAULT_RULES, DEFAULT_CSV_PRESETS } from "./seed-data";

const sqliteModule = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const { DatabaseSync } = sqliteModule;

const DATA_DIR = path.join(process.cwd(), "data");
export const DB_FILE_PATH = path.join(DATA_DIR, "aurora.db");

declare global {
  // eslint-disable-next-line no-var
  var __auroraSqlite: DatabaseSyncType | undefined;
  // eslint-disable-next-line no-var
  var __auroraBootstrapped: boolean | undefined;
}

function getSqliteConnection(): DatabaseSyncType {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!global.__auroraSqlite) {
    const conn = new DatabaseSync(DB_FILE_PATH, { timeout: 10000 });
    conn.exec("PRAGMA busy_timeout = 10000;");
    conn.exec("PRAGMA journal_mode = WAL;");
    conn.exec("PRAGMA foreign_keys = ON;");
    conn.exec("PRAGMA synchronous = NORMAL;");
    global.__auroraSqlite = conn;
  }

  return global.__auroraSqlite;
}

function toPlainValue<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(toPlainValue) as unknown as T;
  }
  return { ...(val as Record<string, unknown>) } as T;
}

export const sqlite: DatabaseSyncType = new Proxy({} as DatabaseSyncType, {
  get(_target, prop) {
    const conn = getSqliteConnection();
    if (prop === "prepare") {
      return (sql: string) => {
        const stmt = conn.prepare(sql);
        return new Proxy(stmt, {
          get(stmtTarget, stmtProp) {
            if (stmtProp === "all") {
              return (...args: Parameters<typeof stmt.all>) => {
                const rows = stmtTarget.all(...args);
                return rows.map((r) => toPlainValue(r));
              };
            }
            if (stmtProp === "get") {
              return (...args: Parameters<typeof stmt.get>) => {
                const row = stmtTarget.get(...args);
                return toPlainValue(row);
              };
            }
            const v = Reflect.get(stmtTarget, stmtProp, stmtTarget);
            return typeof v === "function" ? v.bind(stmtTarget) : v;
          },
        });
      };
    }
    const val = Reflect.get(conn, prop, conn);
    return typeof val === "function" ? val.bind(conn) : val;
  },
});

export const db = drizzle(
  async (sql, params, method) => {
    try {
      const stmt = sqlite.prepare(sql);
      const safeParams = (params ?? []) as (string | number | bigint | null | Uint8Array)[];

      if (method === "run") {
        stmt.run(...safeParams);
        return { rows: [] };
      }

      stmt.setReturnArrays(true);

      if (method === "get") {
        const row = stmt.get(...safeParams);
        return { rows: (row ?? undefined) as unknown as string[] };
      }

      const rows = stmt.all(...safeParams);
      return { rows: rows as unknown as string[][] };
    } catch (error) {
      console.error("[Aurora SQLite Error]", { sql, params, method, error });
      throw error;
    }
  },
  { schema }
);

export function ensureDatabaseInitialized() {
  if (global.__auroraBootstrapped) {
    return;
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      institution TEXT NOT NULL DEFAULT 'other',
      type TEXT NOT NULL DEFAULT 'checking',
      initial_balance_cents INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#22D3EE',
      closing_day INTEGER,
      due_day INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      icon TEXT NOT NULL DEFAULT 'Tag',
      color TEXT NOT NULL DEFAULT '#22D3EE',
      monthly_budget_cents INTEGER,
      is_system INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_key TEXT NOT NULL UNIQUE,
      default_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_hash TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported_count INTEGER NOT NULL DEFAULT 0,
      duplicate_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      merchant_id TEXT REFERENCES merchants(id) ON DELETE SET NULL,
      import_batch_id TEXT REFERENCES import_batches(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      competence_date TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      raw_description TEXT NOT NULL,
      clean_description TEXT NOT NULL,
      merchant_name TEXT,
      installment_current INTEGER,
      installment_total INTEGER,
      external_id TEXT,
      dedup_hash TEXT NOT NULL,
      classification_source TEXT NOT NULL DEFAULT 'uncategorized',
      confidence_score REAL NOT NULL DEFAULT 0,
      is_reviewed INTEGER NOT NULL DEFAULT 0,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      is_ignored INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_dedup ON transactions(dedup_hash);
    CREATE INDEX IF NOT EXISTS idx_transactions_batch ON transactions(import_batch_id);

    CREATE TABLE IF NOT EXISTS categorization_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'contains',
      pattern TEXT NOT NULL,
      min_amount_cents INTEGER,
      max_amount_cents INTEGER,
      target_category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      target_merchant_name TEXT,
      priority INTEGER NOT NULL DEFAULT 100,
      is_active INTEGER NOT NULL DEFAULT 1,
      hit_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS csv_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      institution TEXT NOT NULL DEFAULT 'custom',
      date_column TEXT NOT NULL,
      description_column TEXT NOT NULL,
      amount_column TEXT NOT NULL,
      credit_column TEXT,
      debit_column TEXT,
      category_column TEXT,
      date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
      delimiter TEXT NOT NULL DEFAULT ',',
      invert_signal INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Seed default categories, rules, and CSV presets (NO demo transactions)
  const countRow = sqlite.prepare("SELECT COUNT(*) as cnt FROM categories").get() as
    | { cnt: number }
    | undefined;

  if (!countRow || Number(countRow.cnt) === 0) {
    const now = new Date().toISOString();

    const insertCategory = sqlite.prepare(`
      INSERT OR IGNORE INTO categories (
        id, parent_id, name, slug, type, icon, color, monthly_budget_cents, is_system, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const cat of DEFAULT_CATEGORIES) {
      insertCategory.run(
        cat.id,
        cat.parentId ?? null,
        cat.name,
        cat.slug,
        cat.type ?? "expense",
        cat.icon ?? "Tag",
        cat.color ?? "#22D3EE",
        cat.monthlyBudgetCents ?? null,
        cat.isSystem ?? 1,
        cat.sortOrder ?? 0
      );
    }

    const insertRule = sqlite.prepare(`
      INSERT OR IGNORE INTO categorization_rules (
        id, name, match_type, pattern, min_amount_cents, max_amount_cents,
        target_category_id, target_merchant_name, priority, is_active, hit_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of DEFAULT_RULES) {
      insertRule.run(
        rule.id,
        rule.name,
        rule.matchType,
        rule.pattern,
        rule.minAmountCents ?? null,
        rule.maxAmountCents ?? null,
        rule.targetCategoryId,
        rule.targetMerchantName ?? null,
        rule.priority,
        rule.isActive,
        rule.hitCount,
        now
      );
    }

    const insertPreset = sqlite.prepare(`
      INSERT OR IGNORE INTO csv_presets (
        id, name, institution, date_column, description_column, amount_column,
        credit_column, debit_column, category_column, date_format, delimiter, invert_signal, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const preset of DEFAULT_CSV_PRESETS) {
      insertPreset.run(
        preset.id,
        preset.name,
        preset.institution,
        preset.dateColumn,
        preset.descriptionColumn,
        preset.amountColumn,
        preset.creditColumn ?? null,
        preset.debitColumn ?? null,
        preset.categoryColumn ?? null,
        preset.dateFormat,
        preset.delimiter,
        preset.invertSignal,
        preset.isSystem
      );
    }
  }

  global.__auroraBootstrapped = true;
}
