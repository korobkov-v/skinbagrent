#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { Client } = require("pg");

const TABLES_IN_ORDER = [
  "users",
  "skills",
  "humans",
  "human_skills",
  "human_availability_windows",
  "reviews",
  "conversations",
  "messages",
  "bounties",
  "bounty_applications",
  "bookings",
  "api_bookings",
  "api_keys",
  "human_wallets",
  "payment_policies",
  "crypto_payouts",
  "payout_events",
  "wallet_verification_challenges",
  "escrow_holds",
  "escrow_events",
  "disputes",
  "dispute_events",
  "payout_webhook_subscriptions",
  "payout_webhook_deliveries",
  "booking_milestones",
  "human_profile_settings",
  "user_email_verification_tokens",
  "user_sessions",
  "mcp_tool_requests",
  "mcp_tool_pr_drafts"
];

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

async function main() {
  const sourceSqliteFile = path.resolve(process.env.SOURCE_SQLITE_FILE || "./data/rent.db");
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (!fs.existsSync(sourceSqliteFile)) {
    throw new Error(`SQLite DB file not found: ${sourceSqliteFile}`);
  }

  const sqlite = new Database(sourceSqliteFile, { readonly: true });
  const postgres = new Client({ connectionString: databaseUrl });

  try {
    await postgres.connect();

    const pgTablesRaw = await postgres.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    );
    const pgTables = new Set(pgTablesRaw.rows.map((row) => row.table_name));
    const missingInPg = TABLES_IN_ORDER.filter((table) => !pgTables.has(table));
    if (missingInPg.length > 0) {
      throw new Error(
        `Postgres schema is not initialized. Missing tables: ${missingInPg.join(
          ", "
        )}. Start the app once with DATABASE_URL before migration.`
      );
    }

    const sqliteTablesRaw = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';")
      .all();
    const sqliteTables = new Set(sqliteTablesRaw.map((row) => row.name));
    const tablesToMigrate = TABLES_IN_ORDER.filter((table) => sqliteTables.has(table));

    console.log(`Source: ${sourceSqliteFile}`);
    console.log(`Target: ${databaseUrl}`);
    console.log(`Tables to migrate: ${tablesToMigrate.length}`);

    await postgres.query("BEGIN");

    for (const table of [...TABLES_IN_ORDER].reverse()) {
      await postgres.query(`TRUNCATE TABLE ${quoteIdent(table)} CASCADE;`);
    }

    for (const table of tablesToMigrate) {
      const rows = sqlite.prepare(`SELECT * FROM ${quoteIdent(table)};`).all();
      if (rows.length === 0) {
        console.log(`- ${table}: 0 rows`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const columnList = columns.map(quoteIdent).join(", ");
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
      const insertSql = `INSERT INTO ${quoteIdent(table)} (${columnList}) VALUES (${placeholders});`;

      for (const row of rows) {
        const values = columns.map((column) => row[column]);
        await postgres.query(insertSql, values);
      }

      console.log(`- ${table}: ${rows.length} rows`);
    }

    await postgres.query("COMMIT");
    console.log("Migration completed.");
  } catch (error) {
    await postgres.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await postgres.end().catch(() => undefined);
    sqlite.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
