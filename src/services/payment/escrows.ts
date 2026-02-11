import { randomUUID } from "crypto";
import { db } from "../../db/client";
import type { EscrowEvent, EscrowHold, EscrowStatus, PayoutExecutionMode, PayoutSourceType } from "../../types";
import { ESCROW_STATUSES, ensureUserExists, now } from "./common";
import { createCryptoPayoutIntent, executeCryptoPayoutByAgent } from "./payouts";
import { findWalletForPayout } from "./wallets";

function createEscrowEvent(input: {
  escrowId: string;
  eventType: string;
  actorType: "user" | "agent" | "system" | "admin";
  actorId?: string;
  payload?: unknown;
}) {
  db.prepare(
    "INSERT INTO escrow_events (id, escrow_id, event_type, actor_type, actor_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    randomUUID(),
    input.escrowId,
    input.eventType,
    input.actorType,
    input.actorId ?? null,
    input.payload ? JSON.stringify(input.payload) : null,
    now()
  );
}

function resolveEscrowSource(input: {
  userId: string;
  sourceType: PayoutSourceType;
  sourceId?: string;
  amountCents?: number;
  humanId?: string;
}): { humanId: string; amountCents: number } {
  if (input.sourceType === "manual") {
    if (!input.humanId || typeof input.amountCents !== "number") {
      throw new Error("manual escrows require humanId and amountCents");
    }
    return { humanId: input.humanId, amountCents: input.amountCents };
  }

  if (!input.sourceId) {
    throw new Error("sourceId is required for bounty and booking escrows");
  }

  if (input.sourceType === "booking") {
    const booking = db
      .prepare("SELECT human_id, total_price_cents, status FROM bookings WHERE id = ? AND user_id = ?")
      .get(input.sourceId, input.userId) as
      | { human_id: string; total_price_cents: number; status: string }
      | undefined;

    if (!booking) {
      throw new Error("Booking not found");
    }
    if (booking.status === "cancelled") {
      throw new Error("Cannot create escrow for cancelled booking");
    }
    return { humanId: booking.human_id, amountCents: input.amountCents ?? booking.total_price_cents };
  }

  const accepted = db
    .prepare(
      `SELECT ba.human_id, ba.proposed_amount_cents
       FROM bounty_applications ba
       JOIN bounties b ON b.id = ba.bounty_id
       WHERE ba.bounty_id = ? AND b.user_id = ? AND ba.status = 'accepted'
       ORDER BY ba.updated_at DESC
       LIMIT 1`
    )
    .get(input.sourceId, input.userId) as { human_id: string; proposed_amount_cents: number } | undefined;

  if (!accepted) {
    throw new Error("No accepted application found for bounty escrow");
  }

  return {
    humanId: accepted.human_id,
    amountCents: input.amountCents ?? accepted.proposed_amount_cents
  };
}

export function createEscrowHold(input: {
  userId: string;
  sourceType: PayoutSourceType;
  sourceId?: string;
  humanId?: string;
  amountCents?: number;
  chain: "ethereum" | "polygon" | "arbitrum" | "solana" | "bitcoin" | "tron";
  network: "mainnet" | "testnet";
  tokenSymbol: string;
  walletId?: string;
  note?: string;
  createdByAgentId?: string;
}): EscrowHold {
  ensureUserExists(input.userId);

  const tokenSymbol = input.tokenSymbol.trim().toUpperCase();
  const resolution = resolveEscrowSource({
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    humanId: input.humanId,
    amountCents: input.amountCents
  });

  if (resolution.amountCents <= 0) {
    throw new Error("Escrow amount must be positive");
  }

  const wallet = findWalletForPayout({
    humanId: resolution.humanId,
    chain: input.chain,
    network: input.network,
    tokenSymbol,
    walletId: input.walletId
  });

  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO escrow_holds (
      id, user_id, human_id, wallet_id, source_type, source_id, chain, network, token_symbol,
      amount_cents, status, release_payout_id, note, created_by_agent_id, held_at,
      released_at, cancelled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    resolution.humanId,
    wallet.id,
    input.sourceType,
    input.sourceId ?? null,
    input.chain,
    input.network,
    tokenSymbol,
    resolution.amountCents,
    "held",
    null,
    input.note?.trim() || null,
    input.createdByAgentId ?? null,
    ts,
    null,
    null,
    ts,
    ts
  );

  createEscrowEvent({
    escrowId: id,
    eventType: "escrow_created",
    actorType: input.createdByAgentId ? "agent" : "user",
    actorId: input.createdByAgentId ?? input.userId,
    payload: {
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      chain: input.chain,
      network: input.network,
      tokenSymbol,
      amountCents: resolution.amountCents
    }
  });

  const escrow = getEscrowHold(input.userId, id);
  if (!escrow) {
    throw new Error("Failed to create escrow hold");
  }
  return escrow;
}

export function getEscrowHold(userId: string, escrowId: string): EscrowHold | null {
  const row = db
    .prepare(
      `SELECT
         id, user_id, human_id, wallet_id, source_type, source_id, chain, network, token_symbol,
         amount_cents, status, release_payout_id, note, created_by_agent_id,
         held_at, released_at, cancelled_at, created_at, updated_at
       FROM escrow_holds
       WHERE id = ? AND user_id = ?`
    )
    .get(escrowId, userId) as EscrowHold | undefined;

  return row ?? null;
}

export function listEscrowHolds(input: {
  userId: string;
  status?: EscrowStatus;
  sourceType?: PayoutSourceType;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = ["user_id = ?"];
  const params: Array<string | number> = [input.userId];

  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }
  if (input.sourceType) {
    where.push("source_type = ?");
    params.push(input.sourceType);
  }

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  return db
    .prepare(
      `SELECT
         id, user_id, human_id, wallet_id, source_type, source_id, chain, network, token_symbol,
         amount_cents, status, release_payout_id, note, created_by_agent_id,
         held_at, released_at, cancelled_at, created_at, updated_at
       FROM escrow_holds
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as EscrowHold[];
}

export function listEscrowEvents(userId: string, escrowId: string): EscrowEvent[] {
  const escrow = getEscrowHold(userId, escrowId);
  if (!escrow) {
    throw new Error("Escrow hold not found");
  }

  return db
    .prepare(
      `SELECT id, escrow_id, event_type, actor_type, actor_id, payload_json, created_at
       FROM escrow_events
       WHERE escrow_id = ?
       ORDER BY created_at ASC`
    )
    .all(escrowId) as EscrowEvent[];
}

export function releaseEscrowHold(input: {
  userId: string;
  escrowId: string;
  executionMode: PayoutExecutionMode;
  requestedByAgentId?: string;
  idempotencyKey?: string;
  autoExecute?: boolean;
  txHash?: string;
  confirmImmediately?: boolean;
}) {
  const escrow = getEscrowHold(input.userId, input.escrowId);
  if (!escrow) {
    throw new Error("Escrow hold not found");
  }
  if (escrow.status !== "held") {
    throw new Error(`Escrow hold cannot be released from status ${escrow.status}`);
  }
  if (input.executionMode === "agent_auto" && !input.requestedByAgentId) {
    throw new Error("requestedByAgentId is required for agent_auto release");
  }

  const payout = createCryptoPayoutIntent({
    userId: input.userId,
    sourceType: "manual",
    humanId: escrow.human_id,
    amountCents: escrow.amount_cents,
    chain: escrow.chain,
    network: escrow.network,
    tokenSymbol: escrow.token_symbol,
    walletId: escrow.wallet_id,
    executionMode: input.executionMode,
    requestedByAgentId: input.requestedByAgentId,
    idempotencyKey: input.idempotencyKey
  });

  const ts = now();
  db.prepare(
    `UPDATE escrow_holds
     SET status = 'released', release_payout_id = ?, released_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(payout.id, ts, ts, input.escrowId);

  createEscrowEvent({
    escrowId: input.escrowId,
    eventType: "escrow_released",
    actorType: input.requestedByAgentId ? "agent" : "user",
    actorId: input.requestedByAgentId ?? input.userId,
    payload: { payoutId: payout.id, executionMode: input.executionMode }
  });

  let finalPayout = payout;
  if (input.executionMode === "agent_auto" && input.autoExecute) {
    finalPayout = executeCryptoPayoutByAgent({
      userId: input.userId,
      payoutId: payout.id,
      agentId: input.requestedByAgentId!,
      txHash: input.txHash,
      confirmImmediately: input.confirmImmediately
    });
  }

  return {
    escrow: getEscrowHold(input.userId, input.escrowId)!,
    payout: finalPayout
  };
}

export function listEscrowStatuses() {
  return {
    statuses: [...ESCROW_STATUSES]
  };
}
