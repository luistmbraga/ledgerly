import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  ledgerlyDb?: BetterSQLite3Database<typeof schema>;
};

function createDb() {
  const dbPath = path.join(process.cwd(), "data", "ledgerly.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return drizzle(sqlite, { schema });
}

export const db = globalForDb.ledgerlyDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.ledgerlyDb = db;
}
