import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth";
import {
  approveCryptoPayout,
  completeBookingMilestone,
  createBookingMilestone,
  createEscrowHold,
  createCryptoPayoutIntent,
  createPayoutWebhookSubscription,
  createWalletVerificationChallenge,
  estimatePayoutFees,
  executeCryptoPayoutByAgent,
  getCryptoPayout,
  getDispute,
  getEscrowHold,
  getHumanOwnerUserId,
  getPaymentPolicy,
  listDisputeEvents,
  listDisputes,
  listEscrowEvents,
  listEscrowHolds,
  listBookingMilestones,
  listPayoutWebhookDeliveries,
  listPayoutWebhookSubscriptions,
  listWalletVerificationChallenges,
  listCryptoPayouts,
  listHumanWallets,
  listPayoutEvents,
  listSupportedPaymentNetworks,
  markCryptoPayoutFailed,
  openDispute,
  releaseEscrowHold,
  resolveDispute,
  updatePaymentPolicy,
  upsertHumanWallet,
  verifyWalletSignature
} from "../services/paymentService";

export const paymentRouter = Router();

paymentRouter.use(requireAuth);

const chainEnum = z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]);
const networkEnum = z.enum(["mainnet", "testnet"]);
const payoutStatusEnum = z.enum(["pending", "approved", "submitted", "confirmed", "failed", "cancelled"]);
const sourceTypeEnum = z.enum(["bounty", "booking", "manual"]);
const executionModeEnum = z.enum(["manual", "agent_auto"]);
const walletChallengeStatusEnum = z.enum(["pending", "verified", "expired", "rejected"]);
const escrowStatusEnum = z.enum(["held", "released", "cancelled", "expired"]);
const disputeStatusEnum = z.enum(["open", "under_review", "resolved", "rejected"]);
const disputeTargetTypeEnum = z.enum(["booking", "payout", "escrow", "bounty"]);
const disputeDecisionEnum = z.enum(["refund", "release", "split", "no_action", "reject"]);
const payoutWebhookSubscriptionStatusEnum = z.enum(["active", "paused", "revoked"]);
const payoutWebhookDeliveryStatusEnum = z.enum(["queued", "delivered", "failed"]);
const milestoneSourceTypeEnum = z.enum(["booking", "bounty"]);
const milestoneStatusEnum = z.enum(["planned", "in_progress", "completed", "paid", "cancelled"]);
const payoutWebhookEventEnum = z.enum([
  "*",
  "payout_created",
  "payout_auto_approved",
  "payout_approved",
  "payout_submitted",
  "payout_confirmed",
  "payout_failed",
  "payout_cancelled"
]);

paymentRouter.get("/payments/networks", (_req, res) => {
  return res.json(listSupportedPaymentNetworks());
});

paymentRouter.get("/payment-policy", (req, res) => {
  const policy = getPaymentPolicy(req.authUser!.id);
  return res.json({ policy });
});

const updatePolicySchema = z.object({
  autopayEnabled: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  maxSinglePayoutCents: z.coerce.number().int().positive().optional(),
  maxDailyPayoutCents: z.coerce.number().int().positive().optional(),
  allowedChains: z.array(chainEnum).min(1).optional(),
  allowedTokens: z.array(z.string().min(2).max(12)).min(1).optional()
});

paymentRouter.patch("/payment-policy", (req, res) => {
  const payload = updatePolicySchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const policy = updatePaymentPolicy({
      userId: req.authUser!.id,
      ...payload.data
    });
    return res.json({ policy });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/humans/:humanId/wallets", (req, res) => {
  try {
    const wallets = listHumanWallets(req.params.humanId);
    return res.json({ wallets });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

const upsertWalletSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  chain: chainEnum,
  network: networkEnum,
  tokenSymbol: z.string().min(2).max(12),
  address: z.string().min(10).max(120),
  destinationTag: z.string().max(120).nullable().optional(),
  isDefault: z.boolean().optional(),
  verificationStatus: z.enum(["unverified", "verified", "rejected"]).optional()
});

paymentRouter.post("/humans/:humanId/wallets", (req, res) => {
  const payload = upsertWalletSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const ownerUserId = getHumanOwnerUserId(req.params.humanId);
    const isAdmin = req.authUser!.role === "admin";
    if (!isAdmin && ownerUserId !== req.authUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!isAdmin && payload.data.verificationStatus) {
      return res.status(403).json({ error: "Only admins can set verificationStatus" });
    }

    const wallet = upsertHumanWallet({
      humanId: req.params.humanId,
      ...payload.data
    });
    return res.status(201).json({ wallet });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const walletChallengeSchema = z.object({
  walletId: z.string().uuid().optional(),
  chain: chainEnum.optional(),
  network: networkEnum.optional(),
  tokenSymbol: z.string().min(2).max(12).optional(),
  address: z.string().min(10).max(120).optional(),
  expiresInMinutes: z.coerce.number().int().min(1).max(24 * 60).optional()
});

paymentRouter.post("/humans/:humanId/wallet-verification-challenges", (req, res) => {
  const payload = walletChallengeSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const ownerUserId = getHumanOwnerUserId(req.params.humanId);
    const isAdmin = req.authUser!.role === "admin";
    if (!isAdmin && ownerUserId !== req.authUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const challenge = createWalletVerificationChallenge({
      humanId: req.params.humanId,
      walletId: payload.data.walletId,
      chain: payload.data.chain,
      network: payload.data.network,
      tokenSymbol: payload.data.tokenSymbol,
      address: payload.data.address,
      expiresInMinutes: payload.data.expiresInMinutes
    });
    return res.status(201).json({ challenge });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/humans/:humanId/wallet-verification-challenges", (req, res) => {
  const query = z
    .object({
      status: walletChallengeStatusEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  try {
    const ownerUserId = getHumanOwnerUserId(req.params.humanId);
    const isAdmin = req.authUser!.role === "admin";
    if (!isAdmin && ownerUserId !== req.authUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const challenges = listWalletVerificationChallenges({
      humanId: req.params.humanId,
      status: query.data.status,
      limit: query.data.limit,
      offset: query.data.offset
    });
    return res.json({ challenges });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const verifyWalletSignatureSchema = z.object({
  humanId: z.string().uuid(),
  challengeId: z.string().uuid(),
  signature: z.string().min(12).max(600)
});

paymentRouter.post("/wallet-verification/verify", (req, res) => {
  const payload = verifyWalletSignatureSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const ownerUserId = getHumanOwnerUserId(payload.data.humanId);
    const isAdmin = req.authUser!.role === "admin";
    if (!isAdmin && ownerUserId !== req.authUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const verification = verifyWalletSignature({
      challengeId: payload.data.challengeId,
      signature: payload.data.signature,
      expectedHumanId: payload.data.humanId
    });
    return res.json(verification);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const createEscrowSchema = z
  .object({
    sourceType: sourceTypeEnum,
    sourceId: z.string().uuid().optional(),
    humanId: z.string().uuid().optional(),
    amountCents: z.coerce.number().int().positive().optional(),
    chain: chainEnum,
    network: networkEnum,
    tokenSymbol: z.string().min(2).max(12),
    walletId: z.string().uuid().optional(),
    note: z.string().max(2000).optional(),
    createdByAgentId: z.string().min(2).max(120).optional()
  })
  .superRefine((value, ctx) => {
    if (value.sourceType === "manual") {
      if (!value.humanId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "humanId is required for manual escrow" });
      }
      if (!value.amountCents) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amountCents is required for manual escrow" });
      }
    }
    if (value.sourceType !== "manual" && !value.sourceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for bounty/booking escrow" });
    }
  });

paymentRouter.post("/escrows", (req, res) => {
  const payload = createEscrowSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const escrow = createEscrowHold({
      userId: req.authUser!.id,
      sourceType: payload.data.sourceType,
      sourceId: payload.data.sourceId,
      humanId: payload.data.humanId,
      amountCents: payload.data.amountCents,
      chain: payload.data.chain,
      network: payload.data.network,
      tokenSymbol: payload.data.tokenSymbol,
      walletId: payload.data.walletId,
      note: payload.data.note,
      createdByAgentId: payload.data.createdByAgentId
    });
    return res.status(201).json({ escrow });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/escrows", (req, res) => {
  const query = z
    .object({
      status: escrowStatusEnum.optional(),
      sourceType: sourceTypeEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  const escrows = listEscrowHolds({
    userId: req.authUser!.id,
    status: query.data.status,
    sourceType: query.data.sourceType,
    limit: query.data.limit,
    offset: query.data.offset
  });
  return res.json({ escrows });
});

paymentRouter.get("/escrows/:escrowId", (req, res) => {
  const escrow = getEscrowHold(req.authUser!.id, req.params.escrowId);
  if (!escrow) {
    return res.status(404).json({ error: "Escrow hold not found" });
  }
  return res.json({ escrow });
});

paymentRouter.get("/escrows/:escrowId/events", (req, res) => {
  try {
    const events = listEscrowEvents(req.authUser!.id, req.params.escrowId);
    return res.json({ events });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

const releaseEscrowSchema = z.object({
  executionMode: executionModeEnum.default("manual"),
  requestedByAgentId: z.string().min(2).max(120).optional(),
  idempotencyKey: z.string().min(6).max(120).optional(),
  autoExecute: z.boolean().optional(),
  txHash: z.string().min(8).max(140).optional(),
  confirmImmediately: z.boolean().optional()
});

paymentRouter.post("/escrows/:escrowId/release", (req, res) => {
  const payload = releaseEscrowSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = releaseEscrowHold({
      userId: req.authUser!.id,
      escrowId: req.params.escrowId,
      executionMode: payload.data.executionMode,
      requestedByAgentId: payload.data.requestedByAgentId,
      idempotencyKey: payload.data.idempotencyKey,
      autoExecute: payload.data.autoExecute,
      txHash: payload.data.txHash,
      confirmImmediately: payload.data.confirmImmediately
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const openDisputeSchema = z.object({
  targetType: disputeTargetTypeEnum,
  targetId: z.string().uuid(),
  reason: z.string().min(8).max(4000),
  evidence: z.record(z.any()).optional(),
  openedByAgentId: z.string().min(2).max(120).optional()
});

paymentRouter.post("/disputes", (req, res) => {
  const payload = openDisputeSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const dispute = openDispute({
      userId: req.authUser!.id,
      targetType: payload.data.targetType,
      targetId: payload.data.targetId,
      reason: payload.data.reason,
      evidence: payload.data.evidence,
      openedByAgentId: payload.data.openedByAgentId
    });
    return res.status(201).json({ dispute });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/disputes", (req, res) => {
  const query = z
    .object({
      status: disputeStatusEnum.optional(),
      targetType: disputeTargetTypeEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  const disputes = listDisputes({
    userId: req.authUser!.id,
    status: query.data.status,
    targetType: query.data.targetType,
    limit: query.data.limit,
    offset: query.data.offset
  });
  return res.json({ disputes });
});

paymentRouter.get("/disputes/:disputeId", (req, res) => {
  const dispute = getDispute(req.authUser!.id, req.params.disputeId);
  if (!dispute) {
    return res.status(404).json({ error: "Dispute not found" });
  }
  return res.json({ dispute });
});

paymentRouter.get("/disputes/:disputeId/events", (req, res) => {
  try {
    const events = listDisputeEvents(req.authUser!.id, req.params.disputeId);
    return res.json({ events });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

const resolveDisputeSchema = z.object({
  decision: disputeDecisionEnum,
  note: z.string().max(3000).optional()
});

paymentRouter.post("/disputes/:disputeId/resolve", requireRole(["admin"]), (req, res) => {
  const payload = resolveDisputeSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const dispute = resolveDispute({
      disputeId: req.params.disputeId,
      reviewerUserId: req.authUser!.id,
      decision: payload.data.decision,
      note: payload.data.note
    });
    return res.json({ dispute });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const estimatePayoutFeesSchema = z.object({
  chain: chainEnum,
  network: networkEnum,
  tokenSymbol: z.string().min(2).max(12),
  amountCents: z.coerce.number().int().positive(),
  executionMode: executionModeEnum.optional()
});

paymentRouter.post("/payouts/estimate-fees", (req, res) => {
  const payload = estimatePayoutFeesSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const estimate = estimatePayoutFees({
      chain: payload.data.chain,
      network: payload.data.network,
      tokenSymbol: payload.data.tokenSymbol,
      amountCents: payload.data.amountCents,
      executionMode: payload.data.executionMode
    });
    return res.json({ estimate });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const createPayoutWebhookSubscriptionSchema = z.object({
  endpointUrl: z.string().url().max(1000),
  events: z.array(payoutWebhookEventEnum).min(1).max(20).optional(),
  secret: z.string().min(6).max(300).optional(),
  status: payoutWebhookSubscriptionStatusEnum.optional(),
  description: z.string().max(400).optional(),
  createdByAgentId: z.string().min(2).max(120).optional()
});

paymentRouter.post("/payout-webhooks/subscriptions", (req, res) => {
  const payload = createPayoutWebhookSubscriptionSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const subscription = createPayoutWebhookSubscription({
      userId: req.authUser!.id,
      endpointUrl: payload.data.endpointUrl,
      events: payload.data.events,
      secret: payload.data.secret,
      status: payload.data.status,
      description: payload.data.description,
      createdByAgentId: payload.data.createdByAgentId
    });
    return res.status(201).json({ subscription });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/payout-webhooks/subscriptions", (req, res) => {
  const query = z
    .object({
      status: payoutWebhookSubscriptionStatusEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  try {
    const subscriptions = listPayoutWebhookSubscriptions({
      userId: req.authUser!.id,
      status: query.data.status,
      limit: query.data.limit,
      offset: query.data.offset
    });
    return res.json({ subscriptions });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/payout-webhooks/deliveries", (req, res) => {
  const query = z
    .object({
      subscriptionId: z.string().uuid().optional(),
      payoutId: z.string().uuid().optional(),
      deliveryStatus: payoutWebhookDeliveryStatusEnum.optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  try {
    const deliveries = listPayoutWebhookDeliveries({
      userId: req.authUser!.id,
      subscriptionId: query.data.subscriptionId,
      payoutId: query.data.payoutId,
      deliveryStatus: query.data.deliveryStatus,
      limit: query.data.limit,
      offset: query.data.offset
    });
    return res.json({ deliveries });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const createMilestoneSchema = z.object({
  sourceType: milestoneSourceTypeEnum,
  sourceId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  amountCents: z.coerce.number().int().positive(),
  dueAt: z.string().datetime().optional(),
  createdByAgentId: z.string().min(2).max(120).optional()
});

paymentRouter.post("/milestones", (req, res) => {
  const payload = createMilestoneSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const milestone = createBookingMilestone({
      userId: req.authUser!.id,
      sourceType: payload.data.sourceType,
      sourceId: payload.data.sourceId,
      title: payload.data.title,
      description: payload.data.description,
      amountCents: payload.data.amountCents,
      dueAt: payload.data.dueAt,
      createdByAgentId: payload.data.createdByAgentId
    });
    return res.status(201).json({ milestone });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/milestones", (req, res) => {
  const query = z
    .object({
      sourceType: milestoneSourceTypeEnum.optional(),
      sourceId: z.string().uuid().optional(),
      status: milestoneStatusEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  try {
    const milestones = listBookingMilestones({
      userId: req.authUser!.id,
      sourceType: query.data.sourceType,
      sourceId: query.data.sourceId,
      status: query.data.status,
      limit: query.data.limit,
      offset: query.data.offset
    });
    return res.json({ milestones });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const completeMilestoneSchema = z
  .object({
    autoCreatePayout: z.boolean().optional(),
    payout: z
      .object({
        chain: chainEnum,
        network: networkEnum,
        tokenSymbol: z.string().min(2).max(12),
        walletId: z.string().uuid().optional(),
        executionMode: executionModeEnum,
        requestedByAgentId: z.string().min(2).max(120).optional(),
        idempotencyKey: z.string().min(6).max(120).optional(),
        autoExecute: z.boolean().optional(),
        txHash: z.string().min(8).max(140).optional(),
        confirmImmediately: z.boolean().optional()
      })
      .optional()
  })
  .superRefine((value, ctx) => {
    if (value.autoCreatePayout && !value.payout) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "payout is required when autoCreatePayout=true" });
    }
    if (value.payout?.executionMode === "agent_auto" && !value.payout.requestedByAgentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "requestedByAgentId is required for executionMode=agent_auto"
      });
    }
  });

paymentRouter.post("/milestones/:milestoneId/complete", (req, res) => {
  const payload = completeMilestoneSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = completeBookingMilestone({
      userId: req.authUser!.id,
      milestoneId: req.params.milestoneId,
      autoCreatePayout: payload.data.autoCreatePayout,
      payout: payload.data.payout
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const createPayoutSchema = z
  .object({
    sourceType: sourceTypeEnum,
    sourceId: z.string().uuid().optional(),
    humanId: z.string().uuid().optional(),
    amountCents: z.coerce.number().int().positive().optional(),
    chain: chainEnum,
    network: networkEnum,
    tokenSymbol: z.string().min(2).max(12),
    walletId: z.string().uuid().optional(),
    executionMode: executionModeEnum.default("manual"),
    requestedByAgentId: z.string().min(2).max(120).optional(),
    idempotencyKey: z.string().min(6).max(120).optional()
  })
  .superRefine((value, ctx) => {
    if (value.sourceType === "manual") {
      if (!value.humanId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "humanId is required for manual payouts" });
      }
      if (!value.amountCents) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amountCents is required for manual payouts" });
      }
    }

    if (value.sourceType !== "manual" && !value.sourceId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sourceId is required for bounty/booking payouts" });
    }

    if (value.executionMode === "agent_auto" && !value.requestedByAgentId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "requestedByAgentId is required for agent_auto mode" });
    }
  });

paymentRouter.post("/payouts", (req, res) => {
  const payload = createPayoutSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const payout = createCryptoPayoutIntent({
      userId: req.authUser!.id,
      sourceType: payload.data.sourceType,
      sourceId: payload.data.sourceId,
      humanId: payload.data.humanId,
      amountCents: payload.data.amountCents,
      chain: payload.data.chain,
      network: payload.data.network,
      tokenSymbol: payload.data.tokenSymbol,
      walletId: payload.data.walletId,
      executionMode: payload.data.executionMode,
      requestedByAgentId: payload.data.requestedByAgentId,
      idempotencyKey: payload.data.idempotencyKey
    });

    return res.status(201).json({ payout });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentRouter.get("/payouts", (req, res) => {
  const query = z
    .object({
      status: payoutStatusEnum.optional(),
      sourceType: sourceTypeEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  const payouts = listCryptoPayouts({
    userId: req.authUser!.id,
    status: query.data.status,
    sourceType: query.data.sourceType,
    limit: query.data.limit,
    offset: query.data.offset
  });

  return res.json({ payouts });
});

paymentRouter.get("/payouts/:payoutId", (req, res) => {
  const payout = getCryptoPayout(req.authUser!.id, req.params.payoutId);
  if (!payout) {
    return res.status(404).json({ error: "Payout not found" });
  }
  return res.json({ payout });
});

paymentRouter.get("/payouts/:payoutId/events", (req, res) => {
  try {
    const events = listPayoutEvents(req.authUser!.id, req.params.payoutId);
    return res.json({ events });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

paymentRouter.post("/payouts/:payoutId/approve", (req, res) => {
  try {
    const payout = approveCryptoPayout({
      userId: req.authUser!.id,
      payoutId: req.params.payoutId,
      actorId: req.authUser!.id
    });
    return res.json({ payout });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const executeSchema = z.object({
  agentId: z.string().min(2).max(120),
  txHash: z.string().min(8).max(140).optional(),
  confirmImmediately: z.boolean().optional()
});

paymentRouter.post("/payouts/:payoutId/execute", (req, res) => {
  const payload = executeSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const payout = executeCryptoPayoutByAgent({
      userId: req.authUser!.id,
      payoutId: req.params.payoutId,
      agentId: payload.data.agentId,
      txHash: payload.data.txHash,
      confirmImmediately: payload.data.confirmImmediately
    });
    return res.json({ payout });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const failSchema = z.object({
  reason: z.string().min(4).max(400)
});

paymentRouter.post("/payouts/:payoutId/fail", (req, res) => {
  const payload = failSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const payout = markCryptoPayoutFailed({
      userId: req.authUser!.id,
      payoutId: req.params.payoutId,
      reason: payload.data.reason,
      actorType: "user",
      actorId: req.authUser!.id
    });
    return res.json({ payout });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
