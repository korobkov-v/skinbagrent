import { z } from "zod";

export const parseSchemas = {
  search_humans: z.object({
    query: z.string().optional(),
    skill: z.string().optional(),
    min_hourly_rate_cents: z.number().int().min(0).optional(),
    max_hourly_rate_cents: z.number().int().min(0).optional(),
    available_only: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  get_human: z.object({ human_id: z.string().uuid() }),
  list_skills: z.object({ query: z.string().optional() }),
  get_reviews: z.object({
    human_id: z.string().uuid(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  start_conversation: z.object({
    human_id: z.string().uuid(),
    subject: z.string().min(2).max(180).optional(),
    message: z.string().min(1).max(4000)
  }),
  send_message: z.object({
    conversation_id: z.string().uuid(),
    message: z.string().min(1).max(4000)
  }),
  get_conversation: z.object({ conversation_id: z.string().uuid() }),
  list_conversations: z.object({
    status: z.enum(["open", "closed"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  create_bounty: z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(10000),
    budget_cents: z.number().int().positive(),
    currency: z.string().length(3).optional(),
    skill_slug: z.string().optional()
  }),
  list_bounties: z.object({
    status: z.enum(["open", "in_review", "in_progress", "completed", "cancelled"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  get_bounty: z.object({ bounty_id: z.string().uuid() }),
  get_bounty_applications: z.object({
    bounty_id: z.string().uuid(),
    status: z.enum(["applied", "accepted", "rejected"]).optional()
  }),
  accept_application: z.object({
    bounty_id: z.string().uuid(),
    application_id: z.string().uuid()
  }),
  update_bounty: z.object({
    bounty_id: z.string().uuid(),
    title: z.string().min(3).max(200).optional(),
    description: z.string().min(10).max(10000).optional(),
    budget_cents: z.number().int().positive().optional(),
    skill_slug: z.string().nullable().optional(),
    status: z.enum(["open", "in_review", "in_progress", "completed", "cancelled"]).optional()
  }),
  set_human_availability_window: z.object({
    human_id: z.string().uuid(),
    day_of_week: z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().min(2).max(120).optional(),
    is_active: z.boolean().optional()
  }),
  match_humans_for_bounty: z.object({
    bounty_id: z.string().uuid(),
    limit: z.number().int().min(1).max(100).optional(),
    include_unavailable: z.boolean().optional()
  }),
  book_human: z.object({
    human_id: z.string().uuid(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    note: z.string().max(4000).optional()
  }),
  get_booking: z.object({ booking_id: z.string().uuid() }),
  update_booking: z.object({
    booking_id: z.string().uuid(),
    status: z.enum(["requested", "confirmed", "cancelled", "completed"]).optional(),
    note: z.string().nullable().optional()
  }),
  review_completed_booking: z.object({
    booking_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().min(3).max(4000),
    author_name: z.string().min(2).max(120).optional()
  }),
  list_payment_networks: z.object({}),
  estimate_payout_fees: z.object({
    chain: z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]),
    network: z.enum(["mainnet", "testnet"]),
    token_symbol: z.string().min(2).max(12),
    amount_cents: z.number().int().positive(),
    execution_mode: z.enum(["manual", "agent_auto"]).optional()
  }),
  create_payout_webhook_subscription: z.object({
    endpoint_url: z.string().url().max(1000),
    events: z
      .array(
        z.enum([
          "*",
          "payout_created",
          "payout_auto_approved",
          "payout_approved",
          "payout_submitted",
          "payout_confirmed",
          "payout_failed",
          "payout_cancelled"
        ])
      )
      .min(1)
      .max(20)
      .optional(),
    secret: z.string().min(6).max(300).optional(),
    status: z.enum(["active", "paused", "revoked"]).optional(),
    description: z.string().max(400).optional(),
    created_by_agent_id: z.string().min(2).max(120).optional()
  }),
  list_payout_webhook_deliveries: z.object({
    subscription_id: z.string().uuid().optional(),
    payout_id: z.string().uuid().optional(),
    delivery_status: z.enum(["queued", "delivered", "failed"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    offset: z.number().int().min(0).optional()
  }),
  register_human_wallet: z.object({
    human_id: z.string().uuid(),
    label: z.string().min(1).max(120).optional(),
    chain: z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]),
    network: z.enum(["mainnet", "testnet"]),
    token_symbol: z.string().min(2).max(12),
    address: z.string().min(10).max(120),
    destination_tag: z.string().max(120).nullable().optional(),
    is_default: z.boolean().optional(),
    verification_status: z.enum(["unverified", "verified", "rejected"]).optional()
  }),
  list_human_wallets: z.object({
    human_id: z.string().uuid()
  }),
  get_payment_policy: z.object({}),
  update_payment_policy: z.object({
    autopay_enabled: z.boolean().optional(),
    require_approval: z.boolean().optional(),
    max_single_payout_cents: z.number().int().positive().optional(),
    max_daily_payout_cents: z.number().int().positive().optional(),
    allowed_chains: z
      .array(z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]))
      .min(1)
      .optional(),
    allowed_tokens: z.array(z.string().min(2).max(12)).min(1).optional()
  }),
  create_crypto_payout: z
    .object({
      source_type: z.enum(["bounty", "booking", "manual"]),
      source_id: z.string().uuid().optional(),
      human_id: z.string().uuid().optional(),
      amount_cents: z.number().int().positive().optional(),
      chain: z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]),
      network: z.enum(["mainnet", "testnet"]),
      token_symbol: z.string().min(2).max(12),
      wallet_id: z.string().uuid().optional(),
      execution_mode: z.enum(["manual", "agent_auto"]),
      requested_by_agent_id: z.string().min(2).max(120).optional(),
      idempotency_key: z.string().min(6).max(120).optional()
    })
    .superRefine((value, ctx) => {
      if (value.source_type === "manual") {
        if (!value.human_id) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "human_id is required for manual source" });
        }
        if (!value.amount_cents) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount_cents is required for manual source" });
        }
      }

      if (value.source_type !== "manual" && !value.source_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "source_id is required for bounty/booking source" });
      }

      if (value.execution_mode === "agent_auto" && !value.requested_by_agent_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "requested_by_agent_id is required for execution_mode=agent_auto"
        });
      }
    }),
  list_crypto_payouts: z.object({
    status: z.enum(["pending", "approved", "submitted", "confirmed", "failed", "cancelled"]).optional(),
    source_type: z.enum(["bounty", "booking", "manual"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  get_crypto_payout: z.object({
    payout_id: z.string().uuid()
  }),
  approve_crypto_payout: z.object({
    payout_id: z.string().uuid()
  }),
  execute_crypto_payout: z.object({
    payout_id: z.string().uuid(),
    agent_id: z.string().min(2).max(120),
    tx_hash: z.string().min(8).max(140).optional(),
    confirm_immediately: z.boolean().optional()
  }),
  fail_crypto_payout: z.object({
    payout_id: z.string().uuid(),
    reason: z.string().min(4).max(400)
  }),
  get_payout_events: z.object({
    payout_id: z.string().uuid()
  }),
  create_booking_milestone: z.object({
    source_type: z.enum(["booking", "bounty"]),
    source_id: z.string().uuid(),
    title: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    amount_cents: z.number().int().positive(),
    due_at: z.string().datetime().optional(),
    created_by_agent_id: z.string().min(2).max(120).optional()
  }),
  list_booking_milestones: z.object({
    source_type: z.enum(["booking", "bounty"]).optional(),
    source_id: z.string().uuid().optional(),
    status: z.enum(["planned", "in_progress", "completed", "paid", "cancelled"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  complete_booking_milestone: z
    .object({
      milestone_id: z.string().uuid(),
      auto_create_payout: z.boolean().optional(),
      payout: z
        .object({
          chain: z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]),
          network: z.enum(["mainnet", "testnet"]),
          token_symbol: z.string().min(2).max(12),
          wallet_id: z.string().uuid().optional(),
          execution_mode: z.enum(["manual", "agent_auto"]),
          requested_by_agent_id: z.string().min(2).max(120).optional(),
          idempotency_key: z.string().min(6).max(120).optional(),
          auto_execute: z.boolean().optional(),
          tx_hash: z.string().min(8).max(140).optional(),
          confirm_immediately: z.boolean().optional()
        })
        .optional()
    })
    .superRefine((value, ctx) => {
      if (value.auto_create_payout && !value.payout) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "payout is required when auto_create_payout=true"
        });
      }
      if (value.payout?.execution_mode === "agent_auto" && !value.payout.requested_by_agent_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "requested_by_agent_id is required for execution_mode=agent_auto"
        });
      }
    }),
  create_wallet_verification_challenge: z.object({
    human_id: z.string().uuid(),
    wallet_id: z.string().uuid().optional(),
    chain: z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]).optional(),
    network: z.enum(["mainnet", "testnet"]).optional(),
    token_symbol: z.string().min(2).max(12).optional(),
    address: z.string().min(10).max(120).optional(),
    expires_in_minutes: z.number().int().min(1).max(1440).optional()
  }),
  verify_wallet_signature: z.object({
    human_id: z.string().uuid(),
    challenge_id: z.string().uuid(),
    signature: z.string().min(12).max(600)
  }),
  create_escrow_hold: z
    .object({
      source_type: z.enum(["bounty", "booking", "manual"]),
      source_id: z.string().uuid().optional(),
      human_id: z.string().uuid().optional(),
      amount_cents: z.number().int().positive().optional(),
      chain: z.enum(["ethereum", "polygon", "arbitrum", "solana", "bitcoin", "tron"]),
      network: z.enum(["mainnet", "testnet"]),
      token_symbol: z.string().min(2).max(12),
      wallet_id: z.string().uuid().optional(),
      note: z.string().max(2000).optional(),
      created_by_agent_id: z.string().min(2).max(120).optional()
    })
    .superRefine((value, ctx) => {
      if (value.source_type === "manual") {
        if (!value.human_id) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "human_id is required for manual source" });
        }
        if (!value.amount_cents) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "amount_cents is required for manual source" });
        }
      }
      if (value.source_type !== "manual" && !value.source_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "source_id is required for bounty/booking source" });
      }
    }),
  release_escrow_hold: z
    .object({
      escrow_id: z.string().uuid(),
      execution_mode: z.enum(["manual", "agent_auto"]),
      requested_by_agent_id: z.string().min(2).max(120).optional(),
      idempotency_key: z.string().min(6).max(120).optional(),
      auto_execute: z.boolean().optional(),
      tx_hash: z.string().min(8).max(140).optional(),
      confirm_immediately: z.boolean().optional()
    })
    .superRefine((value, ctx) => {
      if (value.execution_mode === "agent_auto" && !value.requested_by_agent_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "requested_by_agent_id is required for execution_mode=agent_auto"
        });
      }
    }),
  open_dispute: z.object({
    target_type: z.enum(["booking", "payout", "escrow", "bounty"]),
    target_id: z.string().uuid(),
    reason: z.string().min(8).max(4000),
    evidence: z.record(z.any()).optional(),
    opened_by_agent_id: z.string().min(2).max(120).optional()
  }),
  resolve_dispute: z.object({
    dispute_id: z.string().uuid(),
    reviewer_user_id: z.string().uuid(),
    decision: z.enum(["refund", "release", "split", "no_action", "reject"]),
    note: z.string().max(3000).optional()
  }),
  request_mcp_tool_creation: z.object({
    requested_by_agent_id: z.string().min(2).max(120),
    tool_name: z.string().min(3).max(80),
    tool_description: z.string().min(6).max(400),
    reason: z.string().min(8).max(3000),
    input_schema: z.record(z.any()),
    output_contract: z.record(z.any()).optional(),
    implementation_notes: z.string().max(4000).optional(),
    target_files: z.array(z.string().min(2).max(260)).max(50).optional(),
    pr_preference: z.enum(["none", "draft_pr"]).optional()
  }),
  list_mcp_tool_creation_requests: z.object({
    status: z.enum(["pending_human_review", "approved", "rejected", "implemented"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  get_mcp_tool_creation_request: z.object({
    request_id: z.string().uuid()
  })
};

export type ToolName = keyof typeof parseSchemas | "get_agent_identity";
