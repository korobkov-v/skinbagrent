import { db } from "./client";
import { applyMigrations } from "./migrations";
import { BASE_SCHEMA_SQL } from "./schema/baseSchema";
import { runSeeds } from "./seed";

const now = () => new Date().toISOString();

export function initializeDatabase() {
  db.exec(BASE_SCHEMA_SQL);
  applyMigrations(now);
  runSeeds(now);
}
