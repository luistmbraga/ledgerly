import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

// SQLite does not allow PRAGMA foreign_keys to change inside a transaction.
// Drizzle's migrate() wraps every migration file in a transaction, so any
// "PRAGMA foreign_keys=OFF" statement inside a migration SQL file is silently
// ignored. Table-rebuild migrations that DROP and re-CREATE tables (e.g. to add
// CHECK constraints) would trigger ON DELETE CASCADE while foreign_keys is still
// ON, destroying rows that should have been preserved.
//
// The fix: disable foreign_keys at the connection level *before* migrate() opens
// any transaction, then re-enable it afterwards.

const dbPath = path.join(process.cwd(), "data", "ledgerly.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("foreign_keys = OFF"); // must be set before any migration transaction
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });

sqlite.pragma("foreign_keys = ON");
sqlite.close();
