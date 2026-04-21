import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { EMPTY_CASH_GOALS, type CashGoals } from "@/lib/cash-goals";

const DB_FILE = "cash-goals.db";

function dataDir(): string {
  const fromEnv = process.env.WEBHOUSE_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), "data");
}

const globalForDb = globalThis as unknown as { __cashGoalsSqlite?: Database.Database };

function openDb(): Database.Database {
  if (globalForDb.__cashGoalsSqlite) return globalForDb.__cashGoalsSqlite;

  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const db = new Database(join(dir, DB_FILE));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cash_goals (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      monthly REAL,
      quarterly REAL,
      yearly REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  globalForDb.__cashGoalsSqlite = db;
  return db;
}

export function readCashGoalsFromDb(): CashGoals {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT monthly, quarterly, yearly FROM cash_goals WHERE id = 1`
    )
    .get() as { monthly: number | null; quarterly: number | null; yearly: number | null } | undefined;
  if (!row) return { ...EMPTY_CASH_GOALS };
  return {
    monthly: row.monthly != null && Number.isFinite(row.monthly) && row.monthly > 0 ? row.monthly : null,
    quarterly:
      row.quarterly != null && Number.isFinite(row.quarterly) && row.quarterly > 0 ? row.quarterly : null,
    yearly: row.yearly != null && Number.isFinite(row.yearly) && row.yearly > 0 ? row.yearly : null,
  };
}

export function writeCashGoalsToDb(goals: CashGoals): void {
  const db = openDb();
  db.prepare(
    `INSERT INTO cash_goals (id, monthly, quarterly, yearly, updated_at)
     VALUES (1, @monthly, @quarterly, @yearly, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       monthly = excluded.monthly,
       quarterly = excluded.quarterly,
       yearly = excluded.yearly,
       updated_at = excluded.updated_at`
  ).run({
    monthly: goals.monthly,
    quarterly: goals.quarterly,
    yearly: goals.yearly,
  });
}
