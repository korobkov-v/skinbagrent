import { randomUUID } from "crypto";
import { db } from "../../db/client";
import type {
  BookingMilestone,
  BookingStatus,
  CryptoChain,
  CryptoNetwork,
  CryptoPayout,
  MilestoneSourceType,
  MilestoneStatus,
  PayoutExecutionMode,
  PayoutSourceType
} from "../../types";
import { MILESTONE_SOURCE_TYPES, MILESTONE_STATUSES, ensureUserExists, now } from "./common";
import { createCryptoPayoutIntent, executeCryptoPayoutByAgent } from "./payouts";

function isMilestoneSourceType(value: string): value is MilestoneSourceType {
  return MILESTONE_SOURCE_TYPES.includes(value as MilestoneSourceType);
}

function isMilestoneStatus(value: string): value is MilestoneStatus {
  return MILESTONE_STATUSES.includes(value as MilestoneStatus);
}

function getMilestoneById(userId: string, milestoneId: string): BookingMilestone | null {
  const row = db
    .prepare(
      `SELECT
         id, user_id, source_type, source_id, title, description, amount_cents, currency, status,
         due_at, completed_at, payout_id, created_by_agent_id, created_at, updated_at
       FROM booking_milestones
       WHERE id = ? AND user_id = ?`
    )
    .get(milestoneId, userId) as BookingMilestone | undefined;
  return row ?? null;
}

function resolveMilestoneSource(input: {
  userId: string;
  sourceType: MilestoneSourceType;
  sourceId: string;
}): { amountCapCents: number; currency: string } {
  if (input.sourceType === "booking") {
    const booking = db
      .prepare("SELECT total_price_cents, status FROM bookings WHERE id = ? AND user_id = ?")
      .get(input.sourceId, input.userId) as { total_price_cents: number; status: BookingStatus } | undefined;
    if (!booking) {
      throw new Error("Booking not found for milestone source");
    }
    if (booking.status === "cancelled") {
      throw new Error("Cannot create milestone for cancelled booking");
    }
    return { amountCapCents: booking.total_price_cents, currency: "USD" };
  }

  const bounty = db
    .prepare("SELECT budget_cents, currency, status FROM bounties WHERE id = ? AND user_id = ?")
    .get(input.sourceId, input.userId) as { budget_cents: number; currency: string; status: string } | undefined;
  if (!bounty) {
    throw new Error("Bounty not found for milestone source");
  }
  if (bounty.status === "cancelled") {
    throw new Error("Cannot create milestone for cancelled bounty");
  }
  return { amountCapCents: bounty.budget_cents, currency: bounty.currency || "USD" };
}

export function createBookingMilestone(input: {
  userId: string;
  sourceType: MilestoneSourceType;
  sourceId: string;
  title: string;
  description?: string;
  amountCents: number;
  dueAt?: string;
  createdByAgentId?: string;
}): BookingMilestone {
  ensureUserExists(input.userId);
  if (!isMilestoneSourceType(input.sourceType)) {
    throw new Error(`Unsupported milestone source type: ${input.sourceType}`);
  }
  if (input.amountCents <= 0) {
    throw new Error("amountCents must be positive");
  }

  const source = resolveMilestoneSource({
    userId: input.userId,
    sourceType: input.sourceType,
    sourceId: input.sourceId
  });

  const allocated = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total
       FROM booking_milestones
       WHERE user_id = ? AND source_type = ? AND source_id = ? AND status != 'cancelled'`
    )
    .get(input.userId, input.sourceType, input.sourceId) as { total: number };
  if (allocated.total + input.amountCents > source.amountCapCents) {
    throw new Error("Milestone amount exceeds source budget/price cap");
  }

  const dueAt = input.dueAt?.trim() || null;
  if (dueAt) {
    const parsedDue = new Date(dueAt);
    if (Number.isNaN(parsedDue.getTime())) {
      throw new Error("Invalid dueAt datetime");
    }
  }

  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO booking_milestones (
      id, user_id, source_type, source_id, title, description, amount_cents, currency,
      status, due_at, completed_at, payout_id, created_by_agent_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.sourceType,
    input.sourceId,
    input.title.trim(),
    input.description?.trim() || null,
    input.amountCents,
    source.currency,
    "planned",
    dueAt,
    null,
    null,
    input.createdByAgentId ?? null,
    ts,
    ts
  );

  return getMilestoneById(input.userId, id)!;
}

export function listBookingMilestones(input: {
  userId: string;
  sourceType?: MilestoneSourceType;
  sourceId?: string;
  status?: MilestoneStatus;
  limit?: number;
  offset?: number;
}) {
  ensureUserExists(input.userId);

  const where: string[] = ["user_id = ?"];
  const params: Array<string | number> = [input.userId];
  if (input.sourceType) {
    if (!isMilestoneSourceType(input.sourceType)) {
      throw new Error(`Unsupported milestone source type: ${input.sourceType}`);
    }
    where.push("source_type = ?");
    params.push(input.sourceType);
  }
  if (input.sourceId) {
    where.push("source_id = ?");
    params.push(input.sourceId);
  }
  if (input.status) {
    if (!isMilestoneStatus(input.status)) {
      throw new Error(`Unsupported milestone status: ${input.status}`);
    }
    where.push("status = ?");
    params.push(input.status);
  }

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  return db
    .prepare(
      `SELECT
         id, user_id, source_type, source_id, title, description, amount_cents, currency, status,
         due_at, completed_at, payout_id, created_by_agent_id, created_at, updated_at
       FROM booking_milestones
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as BookingMilestone[];
}

export function completeBookingMilestone(input: {
  userId: string;
  milestoneId: string;
  autoCreatePayout?: boolean;
  payout?: {
    chain: CryptoChain;
    network: CryptoNetwork;
    tokenSymbol: string;
    walletId?: string;
    executionMode: PayoutExecutionMode;
    requestedByAgentId?: string;
    idempotencyKey?: string;
    autoExecute?: boolean;
    txHash?: string;
    confirmImmediately?: boolean;
  };
}) {
  const milestone = getMilestoneById(input.userId, input.milestoneId);
  if (!milestone) {
    throw new Error("Milestone not found");
  }
  if (["cancelled", "paid"].includes(milestone.status)) {
    throw new Error(`Milestone cannot be completed from status ${milestone.status}`);
  }

  let payout: CryptoPayout | null = null;
  if (input.autoCreatePayout) {
    if (!input.payout) {
      throw new Error("payout config is required when autoCreatePayout=true");
    }
    payout = createCryptoPayoutIntent({
      userId: input.userId,
      sourceType: milestone.source_type as PayoutSourceType,
      sourceId: milestone.source_id,
      amountCents: milestone.amount_cents,
      chain: input.payout.chain,
      network: input.payout.network,
      tokenSymbol: input.payout.tokenSymbol,
      walletId: input.payout.walletId,
      executionMode: input.payout.executionMode,
      requestedByAgentId: input.payout.requestedByAgentId,
      idempotencyKey: input.payout.idempotencyKey
    });

    if (
      input.payout.executionMode === "agent_auto" &&
      input.payout.autoExecute &&
      input.payout.requestedByAgentId
    ) {
      payout = executeCryptoPayoutByAgent({
        userId: input.userId,
        payoutId: payout.id,
        agentId: input.payout.requestedByAgentId,
        txHash: input.payout.txHash,
        confirmImmediately: input.payout.confirmImmediately
      });
    }
  }

  const ts = now();
  const nextStatus: MilestoneStatus = payout?.status === "confirmed" ? "paid" : "completed";
  db.prepare(
    `UPDATE booking_milestones
     SET status = ?, completed_at = ?, payout_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextStatus, ts, payout?.id ?? milestone.payout_id, ts, input.milestoneId);

  return {
    milestone: getMilestoneById(input.userId, input.milestoneId)!,
    payout
  };
}
