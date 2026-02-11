import { createHash, randomUUID } from "crypto";
import { db } from "../db/client";
import type { CompatApiKey, CompatApiKeyScope } from "../types";

const ALLOWED_SCOPES: CompatApiKeyScope[] = ["compat:read", "compat:write", "compat:admin"];

const now = () => new Date().toISOString();

interface CompatApiKeyView {
  id: string;
  name: string;
  agent_id: string;
  agent_type: string | null;
  scopes: CompatApiKeyScope[];
  status: "active" | "revoked";
  created_by_user_id: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompatApiKeyAuthContext {
  id: string;
  name: string;
  agentId: string;
  agentType: string | null;
  scopes: CompatApiKeyScope[];
}

export function hashCompatApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function parseScopes(raw: string): CompatApiKeyScope[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return ["compat:read"];
    }
    const normalized = parsed
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is CompatApiKeyScope => ALLOWED_SCOPES.includes(value as CompatApiKeyScope));

    const unique = [...new Set(normalized)];
    return unique.length ? unique : ["compat:read"];
  } catch {
    return ["compat:read"];
  }
}

function toView(row: CompatApiKey): CompatApiKeyView {
  return {
    id: row.id,
    name: row.name,
    agent_id: row.agent_id,
    agent_type: row.agent_type,
    scopes: parseScopes(row.scopes_json),
    status: row.status,
    created_by_user_id: row.created_by_user_id,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function buildCompatApiKey(): string {
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 12);
  return `sbr_live_${token}`;
}

export function createCompatApiKey(input: {
  name: string;
  agentId: string;
  agentType?: string;
  scopes?: CompatApiKeyScope[];
  createdByUserId?: string | null;
  providedKey?: string;
}) {
  const name = input.name.trim();
  const agentId = input.agentId.trim();
  if (!name.length) {
    throw new Error("name is required");
  }
  if (!agentId.length) {
    throw new Error("agentId is required");
  }

  const scopes = [...new Set((input.scopes?.length ? input.scopes : ["compat:read", "compat:write"]).map((scope) => scope.trim().toLowerCase()))] as CompatApiKeyScope[];
  if (!scopes.length || scopes.some((scope) => !ALLOWED_SCOPES.includes(scope))) {
    throw new Error(`Invalid scopes. Allowed: ${ALLOWED_SCOPES.join(", ")}`);
  }

  const rawKey = input.providedKey?.trim() || buildCompatApiKey();
  const keyHash = hashCompatApiKey(rawKey);
  const ts = now();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO api_keys (
      id, name, key_hash, agent_id, agent_type, scopes_json, status, created_by_user_id, last_used_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    keyHash,
    agentId,
    input.agentType?.trim() || null,
    JSON.stringify(scopes),
    "active",
    input.createdByUserId ?? null,
    null,
    ts,
    ts
  );

  const created = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(id) as CompatApiKey | undefined;
  if (!created) {
    throw new Error("Failed to create API key");
  }

  return {
    apiKey: rawKey,
    key: toView(created)
  };
}

export function listCompatApiKeys() {
  const rows = db
    .prepare(
      `SELECT id, name, agent_id, agent_type, scopes_json, status, created_by_user_id, last_used_at, created_at, updated_at
       FROM api_keys
       ORDER BY created_at DESC`
    )
    .all() as CompatApiKey[];

  return rows.map(toView);
}

export function revokeCompatApiKey(keyId: string) {
  const ts = now();
  const existing = db
    .prepare("SELECT id FROM api_keys WHERE id = ? AND status = 'active' LIMIT 1")
    .get(keyId) as { id: string } | undefined;
  if (!existing) {
    throw new Error("API key not found or already revoked");
  }

  db.prepare("UPDATE api_keys SET status = 'revoked', updated_at = ? WHERE id = ?").run(ts, keyId);
}

export function authenticateCompatApiKey(rawKey: string): CompatApiKeyAuthContext | null {
  const keyHash = hashCompatApiKey(rawKey);
  const row = db
    .prepare(
      `SELECT id, name, agent_id, agent_type, scopes_json, status
       FROM api_keys
       WHERE key_hash = ?
       LIMIT 1`
    )
    .get(keyHash) as
    | {
        id: string;
        name: string;
        agent_id: string;
        agent_type: string | null;
        scopes_json: string;
        status: "active" | "revoked";
      }
    | undefined;

  if (!row || row.status !== "active") {
    return null;
  }

  const ts = now();
  db.prepare("UPDATE api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, row.id);

  return {
    id: row.id,
    name: row.name,
    agentId: row.agent_id,
    agentType: row.agent_type,
    scopes: parseScopes(row.scopes_json)
  };
}

export function canUseCompatScope(scopes: CompatApiKeyScope[], required: CompatApiKeyScope) {
  return scopes.includes("compat:admin") || scopes.includes(required);
}
