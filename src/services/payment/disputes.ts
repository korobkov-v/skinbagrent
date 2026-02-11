import { randomUUID } from "crypto";
import { db } from "../../db/client";
import type { Dispute, DisputeEvent, DisputeResolution, DisputeStatus, DisputeTargetType } from "../../types";
import { DISPUTE_STATUSES, ensureUserExists, now } from "./common";

function createDisputeEvent(input: {
  disputeId: string;
  eventType: string;
  actorType: "user" | "agent" | "system" | "admin";
  actorId?: string;
  payload?: unknown;
}) {
  db.prepare(
    "INSERT INTO dispute_events (id, dispute_id, event_type, actor_type, actor_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    randomUUID(),
    input.disputeId,
    input.eventType,
    input.actorType,
    input.actorId ?? null,
    input.payload ? JSON.stringify(input.payload) : null,
    now()
  );
}

function getDisputeById(disputeId: string): Dispute | null {
  const row = db
    .prepare(
      `SELECT
         id, user_id, target_type, target_id, opened_by_agent_id, reason, evidence_json,
         status, resolution, resolution_note, resolved_by_user_id, opened_at, resolved_at, created_at, updated_at
       FROM disputes
       WHERE id = ?`
    )
    .get(disputeId) as Dispute | undefined;

  return row ?? null;
}

function assertDisputeTargetExists(userId: string, targetType: DisputeTargetType, targetId: string) {
  if (targetType === "booking") {
    const row = db.prepare("SELECT id FROM bookings WHERE id = ? AND user_id = ?").get(targetId, userId) as
      | { id: string }
      | undefined;
    if (!row) {
      throw new Error("Booking not found for dispute target");
    }
    return;
  }

  if (targetType === "payout") {
    const row = db.prepare("SELECT id FROM crypto_payouts WHERE id = ? AND user_id = ?").get(targetId, userId) as
      | { id: string }
      | undefined;
    if (!row) {
      throw new Error("Payout not found for dispute target");
    }
    return;
  }

  if (targetType === "escrow") {
    const row = db.prepare("SELECT id FROM escrow_holds WHERE id = ? AND user_id = ?").get(targetId, userId) as
      | { id: string }
      | undefined;
    if (!row) {
      throw new Error("Escrow hold not found for dispute target");
    }
    return;
  }

  const row = db.prepare("SELECT id FROM bounties WHERE id = ? AND user_id = ?").get(targetId, userId) as
    | { id: string }
    | undefined;
  if (!row) {
    throw new Error("Bounty not found for dispute target");
  }
}

export function openDispute(input: {
  userId: string;
  targetType: DisputeTargetType;
  targetId: string;
  reason: string;
  evidence?: unknown;
  openedByAgentId?: string;
}) {
  ensureUserExists(input.userId);
  assertDisputeTargetExists(input.userId, input.targetType, input.targetId);

  const id = randomUUID();
  const ts = now();
  db.prepare(
    `INSERT INTO disputes (
      id, user_id, target_type, target_id, opened_by_agent_id, reason, evidence_json,
      status, resolution, resolution_note, resolved_by_user_id, opened_at, resolved_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.targetType,
    input.targetId,
    input.openedByAgentId ?? null,
    input.reason.trim(),
    input.evidence ? JSON.stringify(input.evidence) : null,
    "open",
    null,
    null,
    null,
    ts,
    null,
    ts,
    ts
  );

  createDisputeEvent({
    disputeId: id,
    eventType: "dispute_opened",
    actorType: input.openedByAgentId ? "agent" : "user",
    actorId: input.openedByAgentId ?? input.userId,
    payload: {
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason.trim()
    }
  });

  const dispute = getDispute(input.userId, id);
  if (!dispute) {
    throw new Error("Failed to create dispute");
  }
  return dispute;
}

export function getDispute(userId: string, disputeId: string): Dispute | null {
  const row = db
    .prepare(
      `SELECT
         id, user_id, target_type, target_id, opened_by_agent_id, reason, evidence_json,
         status, resolution, resolution_note, resolved_by_user_id, opened_at, resolved_at, created_at, updated_at
       FROM disputes
       WHERE id = ? AND user_id = ?`
    )
    .get(disputeId, userId) as Dispute | undefined;

  return row ?? null;
}

export function listDisputes(input: {
  userId: string;
  status?: DisputeStatus;
  targetType?: DisputeTargetType;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = ["user_id = ?"];
  const params: Array<string | number> = [input.userId];

  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }
  if (input.targetType) {
    where.push("target_type = ?");
    params.push(input.targetType);
  }

  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  return db
    .prepare(
      `SELECT
         id, user_id, target_type, target_id, opened_by_agent_id, reason, evidence_json,
         status, resolution, resolution_note, resolved_by_user_id, opened_at, resolved_at, created_at, updated_at
       FROM disputes
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Dispute[];
}

export function listDisputeEvents(userId: string, disputeId: string): DisputeEvent[] {
  const dispute = getDispute(userId, disputeId);
  if (!dispute) {
    throw new Error("Dispute not found");
  }

  return db
    .prepare(
      `SELECT id, dispute_id, event_type, actor_type, actor_id, payload_json, created_at
       FROM dispute_events
       WHERE dispute_id = ?
       ORDER BY created_at ASC`
    )
    .all(disputeId) as DisputeEvent[];
}

export function resolveDispute(input: {
  disputeId: string;
  reviewerUserId: string;
  decision: DisputeResolution;
  note?: string;
}) {
  const dispute = getDisputeById(input.disputeId);
  if (!dispute) {
    throw new Error("Dispute not found");
  }
  if (!["open", "under_review"].includes(dispute.status)) {
    throw new Error(`Dispute is already in status ${dispute.status}`);
  }

  const isRejected = input.decision === "reject";
  const ts = now();
  db.prepare(
    `UPDATE disputes
     SET status = ?, resolution = ?, resolution_note = ?, resolved_by_user_id = ?, resolved_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    isRejected ? "rejected" : "resolved",
    input.decision,
    input.note?.trim() || null,
    input.reviewerUserId,
    ts,
    ts,
    input.disputeId
  );

  createDisputeEvent({
    disputeId: input.disputeId,
    eventType: "dispute_resolved",
    actorType: "admin",
    actorId: input.reviewerUserId,
    payload: { decision: input.decision, note: input.note?.trim() || null }
  });

  const updated = getDisputeById(input.disputeId);
  if (!updated) {
    throw new Error("Failed to resolve dispute");
  }
  return updated;
}

export function listDisputeStatuses() {
  return {
    statuses: [...DISPUTE_STATUSES],
    resolutions: ["refund", "release", "split", "no_action", "reject"]
  };
}
