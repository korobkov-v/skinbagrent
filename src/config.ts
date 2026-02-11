import { randomBytes } from "crypto";
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().url().optional(),
  DB_FILE: z.string().default("./data/rent.db"),
  JWT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  TRUST_PROXY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().default("skinbagrent"),
  FIREBASE_WEB_API_KEY: z.string().optional(),
  FIREBASE_WEB_AUTH_DOMAIN: z.string().optional(),
  FIREBASE_WEB_PROJECT_ID: z.string().optional(),
  FIREBASE_WEB_STORAGE_BUCKET: z.string().optional(),
  FIREBASE_WEB_MESSAGING_SENDER_ID: z.string().optional(),
  FIREBASE_WEB_APP_ID: z.string().optional(),
  FIREBASE_WEB_MEASUREMENT_ID: z.string().optional(),
  GA_MEASUREMENT_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),
  MCP_AGENT_ID: z.string().default("skinbag-local-agent"),
  MCP_AGENT_NAME: z.string().default("Skinbag MCP Service"),
  MCP_DEFAULT_USER_EMAIL: z.string().email().default("demo@rent.local"),
  COMPAT_DEMO_API_KEY: z.string().optional()
});

const INSECURE_SECRET_VALUES = new Set(["", "change-me-now", "replace-this-secret"]);
const MIN_SECRET_LENGTH = 32;

function resolveJwtSecret(input: z.infer<typeof envSchema>): string {
  const secret = input.JWT_SECRET?.trim() ?? "";
  const isStrong = secret.length >= MIN_SECRET_LENGTH && !INSECURE_SECRET_VALUES.has(secret);

  if (input.NODE_ENV === "production" && !isStrong) {
    throw new Error("JWT_SECRET must be set to a strong value (32+ chars) in production");
  }

  if (isStrong) {
    return secret;
  }

  return randomBytes(32).toString("hex");
}

function resolveSessionSecret(input: z.infer<typeof envSchema>, jwtSecret: string): string {
  const secret = input.SESSION_SECRET?.trim() ?? "";
  const isStrong = secret.length >= MIN_SECRET_LENGTH;

  if (input.NODE_ENV === "production") {
    if (!isStrong) {
      throw new Error("SESSION_SECRET must be set to a strong value (32+ chars) in production");
    }
    if (secret === jwtSecret) {
      throw new Error("SESSION_SECRET must be different from JWT_SECRET in production");
    }
  }

  if (isStrong) {
    return secret;
  }

  return randomBytes(32).toString("hex");
}

function parseTrustProxy(input: string | undefined): boolean | number | string {
  if (!input || !input.trim()) {
    return false;
  }

  const normalized = input.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }
  return input.trim();
}

function resolveDatabaseUrl(input: z.infer<typeof envSchema>): string | undefined {
  const url = input.DATABASE_URL?.trim();
  if (url) {
    return url;
  }

  if (input.NODE_ENV === "production") {
    throw new Error("DATABASE_URL must be set in production");
  }

  return undefined;
}

const parsed = envSchema.parse(process.env);
const jwtSecret = resolveJwtSecret(parsed);
const sessionSecret = resolveSessionSecret(parsed, jwtSecret);
const databaseUrl = resolveDatabaseUrl(parsed);

export const config = {
  ...parsed,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret,
  SESSION_SECRET: sessionSecret,
  TRUST_PROXY: parseTrustProxy(parsed.TRUST_PROXY),
  DB_FILE: path.resolve(parsed.DB_FILE),
  GOOGLE_CALLBACK_URL:
    parsed.GOOGLE_CALLBACK_URL || `${parsed.APP_URL}/auth/google/callback`
};

export type AppConfig = typeof config;
