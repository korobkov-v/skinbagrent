import { randomUUID } from "crypto";
import { db } from "../../db/client";
import type {
  PayoutWebhookDelivery,
  PayoutWebhookDeliveryStatus,
  PayoutWebhookSubscription,
  PayoutWebhookSubscriptionStatus
} from "../../types";
import {
  PAYOUT_WEBHOOK_DELIVERY_STATUSES,
  PAYOUT_WEBHOOK_EVENT_TYPES,
  PAYOUT_WEBHOOK_SUBSCRIPTION_STATUSES,
  ensureUserExists,
  now,
  parseJsonArray,
  sha256Hex
} from "./common";

interface PayoutWebhookSubscriptionRow extends PayoutWebhookSubscription {}
interface PayoutWebhookDeliveryRow extends PayoutWebhookDelivery {}

function isWebhookSubscriptionStatus(value: string): value is PayoutWebhookSubscriptionStatus {
  return PAYOUT_WEBHOOK_SUBSCRIPTION_STATUSES.includes(value as PayoutWebhookSubscriptionStatus);
}

function isWebhookDeliveryStatus(value: string): value is PayoutWebhookDeliveryStatus {
  return PAYOUT_WEBHOOK_DELIVERY_STATUSES.includes(value as PayoutWebhookDeliveryStatus);
}

function normalizeWebhookEvents(input: string[] | undefined): string[] {
  const normalized = (input ?? ["*"]).map((eventType) => eventType.trim()).filter(Boolean);
  const unique = [...new Set(normalized)];
  if (!unique.length) {
    throw new Error("events must include at least one event type");
  }

  for (const eventType of unique) {
    if (eventType === "*") {
      continue;
    }
    if (!PAYOUT_WEBHOOK_EVENT_TYPES.includes(eventType as (typeof PAYOUT_WEBHOOK_EVENT_TYPES)[number])) {
      throw new Error(`Unsupported webhook event type: ${eventType}`);
    }
  }

  return unique;
}

export function parseWebhookEvents(eventsJson: string): string[] {
  return parseJsonArray<string>(eventsJson, ["*"]);
}

function assertValidWebhookEndpoint(endpointUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    throw new Error("endpointUrl must be a valid URL");
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("endpointUrl must use http or https protocol");
  }
}

function mapPayoutWebhookSubscription(row: PayoutWebhookSubscriptionRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    endpoint_url: row.endpoint_url,
    events: parseWebhookEvents(row.events_json),
    status: row.status,
    description: row.description,
    created_by_agent_id: row.created_by_agent_id,
    has_secret: Boolean(row.secret_hash),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function mapPayoutWebhookDelivery(row: PayoutWebhookDeliveryRow) {
  return {
    ...row,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>
  };
}

export function createPayoutWebhookSubscription(input: {
  userId: string;
  endpointUrl: string;
  events?: string[];
  secret?: string;
  status?: PayoutWebhookSubscriptionStatus;
  description?: string;
  createdByAgentId?: string;
}) {
  ensureUserExists(input.userId);
  assertValidWebhookEndpoint(input.endpointUrl);

  const status = input.status ?? "active";
  if (!isWebhookSubscriptionStatus(status)) {
    throw new Error(`Unsupported webhook subscription status: ${status}`);
  }

  const events = normalizeWebhookEvents(input.events);
  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO payout_webhook_subscriptions (
      id, user_id, endpoint_url, secret_hash, events_json, status, description, created_by_agent_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.endpointUrl.trim(),
    input.secret?.trim() ? sha256Hex(input.secret.trim()) : null,
    JSON.stringify(events),
    status,
    input.description?.trim() || null,
    input.createdByAgentId ?? null,
    ts,
    ts
  );

  const row = db.prepare("SELECT * FROM payout_webhook_subscriptions WHERE id = ?").get(id) as
    | PayoutWebhookSubscriptionRow
    | undefined;
  if (!row) {
    throw new Error("Failed to create payout webhook subscription");
  }

  return mapPayoutWebhookSubscription(row);
}

export function listPayoutWebhookSubscriptions(input: {
  userId: string;
  status?: PayoutWebhookSubscriptionStatus;
  limit?: number;
  offset?: number;
}) {
  ensureUserExists(input.userId);

  const where: string[] = ["user_id = ?"];
  const params: Array<string | number> = [input.userId];
  if (input.status) {
    if (!isWebhookSubscriptionStatus(input.status)) {
      throw new Error(`Unsupported webhook subscription status: ${input.status}`);
    }
    where.push("status = ?");
    params.push(input.status);
  }

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT *
       FROM payout_webhook_subscriptions
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as PayoutWebhookSubscriptionRow[];

  return rows.map(mapPayoutWebhookSubscription);
}

export function listPayoutWebhookDeliveries(input: {
  userId: string;
  subscriptionId?: string;
  payoutId?: string;
  deliveryStatus?: PayoutWebhookDeliveryStatus;
  limit?: number;
  offset?: number;
}) {
  ensureUserExists(input.userId);

  const where: string[] = ["user_id = ?"];
  const params: Array<string | number> = [input.userId];

  if (input.subscriptionId) {
    where.push("subscription_id = ?");
    params.push(input.subscriptionId);
  }
  if (input.payoutId) {
    where.push("payout_id = ?");
    params.push(input.payoutId);
  }
  if (input.deliveryStatus) {
    if (!isWebhookDeliveryStatus(input.deliveryStatus)) {
      throw new Error(`Unsupported webhook delivery status: ${input.deliveryStatus}`);
    }
    where.push("delivery_status = ?");
    params.push(input.deliveryStatus);
  }

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT *
       FROM payout_webhook_deliveries
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as PayoutWebhookDeliveryRow[];

  return rows.map(mapPayoutWebhookDelivery);
}
