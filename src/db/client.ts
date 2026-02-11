import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import Database from "better-sqlite3";
import { config } from "../config";

type SqlValue = string | number | boolean | null | undefined;

interface RunResult {
  changes: number;
}

interface Statement {
  run(...params: SqlValue[]): RunResult;
  get<T = unknown>(...params: SqlValue[]): T | undefined;
  all<T = unknown>(...params: SqlValue[]): T[];
}

interface DbClient {
  driver: "sqlite" | "postgres";
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close?: () => void;
}

function quoteSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function toSqlLiteral(value: SqlValue): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot serialize non-finite number to SQL");
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return quoteSqlString(value);
}

function interpolateParams(sql: string, params: SqlValue[]): string {
  let index = 0;
  const interpolated = sql.replace(/\?/g, () => {
    if (index >= params.length) {
      throw new Error("Not enough SQL parameters supplied");
    }
    const literal = toSqlLiteral(params[index]);
    index += 1;
    return literal;
  });

  if (index !== params.length) {
    throw new Error("Too many SQL parameters supplied");
  }

  return interpolated;
}

function normalizeSqlForPostgres(sql: string): string {
  let normalized = sql;
  normalized = normalized.replace(
    /GROUP_CONCAT\s*\(([^)]+)\)/gi,
    "STRING_AGG($1, ',')",
  );
  normalized = normalized.replace(/date\s*\(\s*'now'\s*\)/gi, "CURRENT_DATE");
  return normalized;
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

class PostgresCliClient implements DbClient {
  driver: "postgres" = "postgres";
  private readonly databaseUrl: string;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  exec(sql: string): void {
    const normalized = normalizeSqlForPostgres(sql);
    this.runPsql(normalized, { tuplesOnly: false });
  }

  prepare(sql: string): Statement {
    return {
      run: (...params: SqlValue[]) => {
        const normalized = normalizeSqlForPostgres(
          interpolateParams(sql, params),
        );
        this.runPsql(normalized, { tuplesOnly: false });
        return { changes: 0 };
      },
      get: <T = unknown>(...params: SqlValue[]) => {
        const rows = this.selectRows<T>(sql, params);
        return rows[0];
      },
      all: <T = unknown>(...params: SqlValue[]) =>
        this.selectRows<T>(sql, params),
    };
  }

  transaction<T extends (...args: any[]) => any>(fn: T): T {
    // The psql CLI client runs each statement in its own process, so we cannot
    // guarantee server-side transaction boundaries here.
    return ((...args: Parameters<T>) => fn(...args)) as T;
  }

  private selectRows<T>(sql: string, params: SqlValue[]): T[] {
    const normalized = normalizeSqlForPostgres(interpolateParams(sql, params));
    const bareSql = stripTrailingSemicolon(normalized);
    const wrapped = `SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (${bareSql}) AS t;`;
    const output = this.runPsql(wrapped, { tuplesOnly: true });
    const trimmed = output.trim();
    const jsonStart = trimmed.indexOf("[");
    const jsonEnd = trimmed.lastIndexOf("]");
    const raw =
      jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart
        ? trimmed.slice(jsonStart, jsonEnd + 1)
        : trimmed || "[]";
    const parsed = JSON.parse(raw) as T[] | null;
    return parsed ?? [];
  }

  private runPsql(sql: string, options: { tuplesOnly: boolean }): string {
    const args = [
      this.databaseUrl,
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-P",
      "pager=off",
      "-P",
      "footer=off",
    ];
    if (options.tuplesOnly) {
      args.push("-t", "-A");
    }
    args.push("-f", "-");

    const result = spawnSync("psql", args, {
      input: sql,
      encoding: "utf8",
      env: process.env,
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      const message =
        result.stderr?.trim() || result.stdout?.trim() || "psql command failed";
      throw new Error(message);
    }

    return result.stdout ?? "";
  }
}

function createSqliteClient(dbFile: string): DbClient {
  const dbDir = path.dirname(dbFile);
  fs.mkdirSync(dbDir, { recursive: true });

  const sqlite = new Database(dbFile);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");

  return Object.assign(sqlite, {
    driver: "sqlite" as const,
  }) as unknown as DbClient;
}

export const db: DbClient = config.DATABASE_URL
  ? new PostgresCliClient(config.DATABASE_URL)
  : createSqliteClient(config.DB_FILE);

export const dbDriver = db.driver;
