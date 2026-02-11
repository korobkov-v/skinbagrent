import { db, dbDriver } from "../client";

function ensureColumn(table: string, column: string, sql: string) {
  const rows =
    dbDriver === "postgres"
      ? (db
          .prepare(
            `SELECT column_name AS name
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = ?`,
          )
          .all(table) as Array<{ name: string }>)
      : (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string;
        }>);

  const exists = rows.some((row) => row.name === column);
  if (!exists) {
    db.exec(sql);
  }
}

export function applyMigrations(now: () => string) {
  ensureColumn(
    "users",
    "email_verified",
    "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
  );
  ensureColumn(
    "users",
    "email_verified_at",
    "ALTER TABLE users ADD COLUMN email_verified_at TEXT",
  );
  ensureColumn(
    "users",
    "role",
    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'human', 'admin', 'agent'))",
  );

  if (dbDriver === "postgres") {
    // Session expiry uses epoch millis, which overflows INT4. Ensure BIGINT.
    db.exec("ALTER TABLE user_sessions ALTER COLUMN expires_at TYPE BIGINT");
  }

  db.prepare(
    "UPDATE users SET role = 'admin', updated_at = ? WHERE lower(email) = lower(?)",
  ).run(now(), "owner@rent.local");
}
