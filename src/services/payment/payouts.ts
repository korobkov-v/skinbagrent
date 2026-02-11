import { randomUUID } from "crypto";
import { db } from "../../db/client";
import type {
  BookingStatus,
  CryptoChain,
  CryptoPayout,
  PayoutEvent,
  PayoutExecutionMode,
  PayoutSourceType,
  PayoutStatus
} from "../../types";
import { ensureHumanExists, ensureUserExists, now, type ActorType } from "./common";
import { assertPolicyAllowsAutoPayout, getPaymentPolicy } from "./policy";
import { parseWebhookEvents } from "./webhooks";
import { assertWalletVerifiedForAgentAuto, findWalletForPayout, getWalletById } from "./wallets";

interface SourceResolution {
  humanId: string;
  amountCents: number;
  sourceStatus?: string;
}

interface CryptoPayoutRow extends CryptoPayout {
  human_name?: string;
  wallet_address?: string;
}

function resolveSource(input: {
  userId: string;
  sourceType: PayoutSourceType;
  sourceId?: string;
  amountCents?: number;
  humanId?: string;
}): SourceResolution {
  if (input.sourceType === "manual") {
    if (!input.humanId || typeof input.amountCents !== "number") {
      throw new Error("manual payouts require humanId and amountCents");
    }
    ensureHumanExists(input.humanId);
    return {
      humanId: input.humanId,
      amountCents: input.amountCents
    };
  }

  if (!input.sourceId) {
    throw new Error("sourceId is required for bounty and booking payouts");
  }

  if (input.sourceType === "booking") {
    const booking = db
      .prepare("SELECT human_id, total_price_cents, status FROM bookings WHERE id = ? AND user_id = ?")
      .get(input.sourceId, input.userId) as
      | { human_id: string; total_price_cents: number; status: BookingStatus }
      | undefined;

    if (!booking) {
      throw new Error("Booking not found");
    }

    if (booking.status === "cancelled") {
      throw new Error("Cannot payout cancelled booking");
    }

    return {
      humanId: booking.human_id,
      amountCents: input.amountCents ?? booking.total_price_cents,
      sourceStatus: booking.status
    };
  }

  const bounty = db
    .prepare("SELECT status FROM bounties WHERE id = ? AND user_id = ?")
    .get(input.sourceId, input.userId) as { status: string } | undefined;

  if (!bounty) {
    throw new Error("Bounty not found");
  }

  const accepted = db
    .prepare(
      `SELECT human_id, proposed_amount_cents
       FROM bounty_applications
       WHERE bounty_id = ? AND status = 'accepted'
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(input.sourceId) as { human_id: string; proposed_amount_cents: number } | undefined;

  if (!accepted) {
    throw new Error("No accepted application found for this bounty");
  }

  return {
    humanId: accepted.human_id,
    amountCents: input.amountCents ?? accepted.proposed_amount_cents,
    sourceStatus: bounty.status
  };
}

function createPayoutEvent(input: {
  payoutId: string;
  eventType: string;
  actorType: ActorType;
  actorId?: string;
  payload?: unknown;
}) {
  const eventId = randomUUID();
  const eventTs = now();
  db.prepare(
    "INSERT INTO payout_events (id, payout_id, event_type, actor_type, actor_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    eventId,
    input.payoutId,
    input.eventType,
    input.actorType,
    input.actorId ?? null,
    input.payload ? JSON.stringify(input.payload) : null,
    eventTs
  );

  const payoutOwner = db.prepare("SELECT user_id FROM crypto_payouts WHERE id = ?").get(input.payoutId) as
    | { user_id: string }
    | undefined;
  if (!payoutOwner) {
    return;
  }

  const subscriptions = db
    .prepare(
      `SELECT id, events_json
       FROM payout_webhook_subscriptions
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at ASC`
    )
    .all(payoutOwner.user_id) as Array<{ id: string; events_json: string }>;

  const deliveryPayload = JSON.stringify({
    eventId,
    eventType: input.eventType,
    payoutId: input.payoutId,
    occurredAt: eventTs,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    payload: input.payload ?? null
  });

  for (const subscription of subscriptions) {
    const events = parseWebhookEvents(subscription.events_json);
    const shouldDeliver = events.includes("*") || events.includes(input.eventType);
    if (!shouldDeliver) {
      continue;
    }

    const deliveryId = randomUUID();
    const deliveryTs = now();
    db.prepare(
      `INSERT INTO payout_webhook_deliveries (
        id, subscription_id, user_id, payout_id, event_type, payload_json, delivery_status, attempt_count,
        http_status, response_body, error_message, last_attempt_at, delivered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      deliveryId,
      subscription.id,
      payoutOwner.user_id,
      input.payoutId,
      input.eventType,
      deliveryPayload,
      "delivered",
      1,
      202,
      JSON.stringify({ simulated: true }),
      null,
      deliveryTs,
      deliveryTs,
      deliveryTs,
      deliveryTs
    );
  }
}

function simulatedTxHash(chain: CryptoChain): string {
  const hashCore = randomUUID().replace(/-/g, "");
  if (chain === "solana") {
    return `sim-sol-${hashCore}`;
  }
  return `0x${hashCore}${hashCore.slice(0, 8)}`;
}

export function createCryptoPayoutIntent(input: {
  userId: string;
  sourceType: PayoutSourceType;
  sourceId?: string;
  humanId?: string;
  amountCents?: number;
  chain: CryptoChain;
  network: "mainnet" | "testnet";
  tokenSymbol: string;
  walletId?: string;
  executionMode: PayoutExecutionMode;
  requestedByAgentId?: string;
  idempotencyKey?: string;
}): CryptoPayout {
  ensureUserExists(input.userId);

  const tokenSymbol = input.tokenSymbol.trim().toUpperCase();
  const resolution = resolveSource({
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    humanId: input.humanId,
    amountCents: input.amountCents
  });

  if (resolution.amountCents <= 0) {
    throw new Error("Payout amount must be positive");
  }

  const wallet = findWalletForPayout({
    humanId: resolution.humanId,
    chain: input.chain,
    network: input.network,
    tokenSymbol,
    walletId: input.walletId
  });

  if (input.executionMode === "agent_auto") {
    assertWalletVerifiedForAgentAuto(wallet);
  }

  const policy = getPaymentPolicy(input.userId);
  if (input.executionMode === "agent_auto") {
    assertPolicyAllowsAutoPayout({
      policy,
      userId: input.userId,
      amountCents: resolution.amountCents,
      chain: input.chain,
      tokenSymbol
    });
  }

  if (input.idempotencyKey) {
    const existing = db
      .prepare("SELECT id FROM crypto_payouts WHERE idempotency_key = ? AND user_id = ?")
      .get(input.idempotencyKey, input.userId) as { id: string } | undefined;

    if (existing) {
      return getCryptoPayout(input.userId, existing.id)!;
    }
  }

  const payoutId = randomUUID();
  const ts = now();

  let status: PayoutStatus = "pending";
  let approvedAt: string | null = null;

  if (input.executionMode === "agent_auto" && !policy.require_approval) {
    status = "approved";
    approvedAt = ts;
  }

  db.prepare(
    `INSERT INTO crypto_payouts (
      id, user_id, human_id, source_type, source_id, wallet_id, chain, network, token_symbol,
      amount_cents, status, execution_mode, tx_hash, idempotency_key, requested_by_agent_id,
      approved_at, submitted_at, confirmed_at, failed_at, failure_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    payoutId,
    input.userId,
    resolution.humanId,
    input.sourceType,
    input.sourceId ?? null,
    wallet.id,
    input.chain,
    input.network,
    tokenSymbol,
    resolution.amountCents,
    status,
    input.executionMode,
    null,
    input.idempotencyKey ?? null,
    input.requestedByAgentId ?? null,
    approvedAt,
    null,
    null,
    null,
    null,
    ts,
    ts
  );

  createPayoutEvent({
    payoutId,
    eventType: "payout_created",
    actorType: input.requestedByAgentId ? "agent" : "user",
    actorId: input.requestedByAgentId ?? input.userId,
    payload: {
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      chain: input.chain,
      network: input.network,
      tokenSymbol,
      amountCents: resolution.amountCents,
      executionMode: input.executionMode
    }
  });

  if (status === "approved") {
    createPayoutEvent({
      payoutId,
      eventType: "payout_auto_approved",
      actorType: "system",
      payload: { reason: "policy.require_approval=false" }
    });
  }

  return getCryptoPayout(input.userId, payoutId)!;
}

export function approveCryptoPayout(input: {
  userId: string;
  payoutId: string;
  actorId?: string;
}): CryptoPayout {
  const payout = getCryptoPayout(input.userId, input.payoutId);
  if (!payout) {
    throw new Error("Payout not found");
  }

  if (payout.status !== "pending") {
    throw new Error(`Cannot approve payout in status ${payout.status}`);
  }

  const ts = now();
  db.prepare("UPDATE crypto_payouts SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?").run(
    ts,
    ts,
    input.payoutId
  );

  createPayoutEvent({
    payoutId: input.payoutId,
    eventType: "payout_approved",
    actorType: "user",
    actorId: input.actorId ?? input.userId
  });

  return getCryptoPayout(input.userId, input.payoutId)!;
}

export function executeCryptoPayoutByAgent(input: {
  userId: string;
  payoutId: string;
  agentId: string;
  txHash?: string;
  confirmImmediately?: boolean;
}): CryptoPayout {
  const payout = getCryptoPayout(input.userId, input.payoutId);
  if (!payout) {
    throw new Error("Payout not found");
  }

  if (payout.execution_mode !== "agent_auto") {
    throw new Error("Only agent_auto payouts can be executed by agent");
  }

  const policy = getPaymentPolicy(input.userId);
  assertPolicyAllowsAutoPayout({
    policy,
    userId: input.userId,
    amountCents: payout.amount_cents,
    chain: payout.chain,
    tokenSymbol: payout.token_symbol
  });

  if (payout.status === "pending") {
    if (policy.require_approval) {
      throw new Error("Payout requires manual approval before execution");
    }

    const tsApprove = now();
    db.prepare("UPDATE crypto_payouts SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?").run(
      tsApprove,
      tsApprove,
      input.payoutId
    );

    createPayoutEvent({
      payoutId: input.payoutId,
      eventType: "payout_auto_approved",
      actorType: "system",
      payload: { reason: "execution_without_manual_approval" }
    });
  }

  const latest = getCryptoPayout(input.userId, input.payoutId)!;
  if (!["approved", "submitted"].includes(latest.status)) {
    throw new Error(`Cannot execute payout in status ${latest.status}`);
  }

  const payoutWallet = getWalletById(latest.wallet_id);
  if (!payoutWallet) {
    throw new Error("Payout wallet not found");
  }
  assertWalletVerifiedForAgentAuto(payoutWallet);

  const txHash = input.txHash?.trim() || simulatedTxHash(latest.chain);
  const ts = now();
  db.prepare(
    "UPDATE crypto_payouts SET status = 'submitted', submitted_at = ?, tx_hash = ?, requested_by_agent_id = ?, updated_at = ? WHERE id = ?"
  ).run(ts, txHash, input.agentId, ts, input.payoutId);

  createPayoutEvent({
    payoutId: input.payoutId,
    eventType: "payout_submitted",
    actorType: "agent",
    actorId: input.agentId,
    payload: { txHash }
  });

  const confirmImmediately = input.confirmImmediately ?? true;
  if (confirmImmediately) {
    const tsConfirmed = now();
    db.prepare("UPDATE crypto_payouts SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?").run(
      tsConfirmed,
      tsConfirmed,
      input.payoutId
    );

    createPayoutEvent({
      payoutId: input.payoutId,
      eventType: "payout_confirmed",
      actorType: "agent",
      actorId: input.agentId,
      payload: { txHash, mode: "simulated" }
    });
  }

  return getCryptoPayout(input.userId, input.payoutId)!;
}

export function markCryptoPayoutFailed(input: {
  userId: string;
  payoutId: string;
  reason: string;
  actorType?: ActorType;
  actorId?: string;
}): CryptoPayout {
  const payout = getCryptoPayout(input.userId, input.payoutId);
  if (!payout) {
    throw new Error("Payout not found");
  }

  if (["confirmed", "cancelled"].includes(payout.status)) {
    throw new Error(`Cannot fail payout in status ${payout.status}`);
  }

  const ts = now();
  db.prepare(
    "UPDATE crypto_payouts SET status = 'failed', failed_at = ?, failure_reason = ?, updated_at = ? WHERE id = ?"
  ).run(ts, input.reason, ts, input.payoutId);

  createPayoutEvent({
    payoutId: input.payoutId,
    eventType: "payout_failed",
    actorType: input.actorType ?? "system",
    actorId: input.actorId,
    payload: { reason: input.reason }
  });

  return getCryptoPayout(input.userId, input.payoutId)!;
}

export function listCryptoPayouts(input: {
  userId: string;
  status?: PayoutStatus;
  sourceType?: PayoutSourceType;
  limit?: number;
  offset?: number;
}): Array<CryptoPayout & { human_name: string; wallet_address: string }> {
  const conditions = ["p.user_id = ?"];
  const params: Array<string | number> = [input.userId];

  if (input.status) {
    conditions.push("p.status = ?");
    params.push(input.status);
  }

  if (input.sourceType) {
    conditions.push("p.source_type = ?");
    params.push(input.sourceType);
  }

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  return db
    .prepare(
      `SELECT p.*, h.display_name AS human_name, w.address AS wallet_address
       FROM crypto_payouts p
       JOIN humans h ON h.id = p.human_id
       JOIN human_wallets w ON w.id = p.wallet_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<CryptoPayout & { human_name: string; wallet_address: string }>;
}

export function getCryptoPayout(userId: string, payoutId: string): (CryptoPayout & {
  human_name?: string;
  wallet_address?: string;
}) | null {
  const row = db
    .prepare(
      `SELECT p.*, h.display_name AS human_name, w.address AS wallet_address
       FROM crypto_payouts p
       JOIN humans h ON h.id = p.human_id
       JOIN human_wallets w ON w.id = p.wallet_id
       WHERE p.id = ? AND p.user_id = ?`
    )
    .get(payoutId, userId) as CryptoPayoutRow | undefined;

  return row ?? null;
}

export function listPayoutEvents(userId: string, payoutId: string): PayoutEvent[] {
  const payout = getCryptoPayout(userId, payoutId);
  if (!payout) {
    throw new Error("Payout not found");
  }

  return db
    .prepare(
      `SELECT id, payout_id, event_type, actor_type, actor_id, payload_json, created_at
       FROM payout_events
       WHERE payout_id = ?
       ORDER BY created_at ASC`
    )
    .all(payoutId) as PayoutEvent[];
}
