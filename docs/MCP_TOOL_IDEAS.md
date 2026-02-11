# MCP Tool Ideas (Roadmap)

Below are candidate tools for the next phase. Priority is set with security, payments, and operational quality in mind.

## P0 (implemented)

1. `create_wallet_verification_challenge` ✅
   - Issues a challenge to sign with a wallet address.
2. `verify_wallet_signature` ✅
   - Verifies the signature and marks the wallet as `verified`.
3. `create_escrow_hold` ✅
   - Reserves funds for booking/bounty until release conditions.
4. `release_escrow_hold` ✅
   - Releases escrow into the payout pipeline after conditions.
5. `open_dispute` ✅
   - Opens a dispute for booking/payout with a reason and evidence.
6. `resolve_dispute` ✅
   - Final dispute decision (refund/release/split) by a human.

## P1 (operational maturity)

1. `estimate_payout_fees` ✅
   - Estimate network fee and net amount before execution.
2. `create_payout_webhook_subscription` ✅
   - Subscribe to payout lifecycle events.
3. `list_payout_webhook_deliveries` ✅
   - Audit webhook deliveries and retry status.
4. `set_human_availability_window` ✅
   - Availability slots by timezone.
5. `match_humans_for_bounty` ✅
   - Rank contractors by skill/rate/rating/availability.
6. `create_booking_milestone` ✅
   - Split booking/bounty into milestones with partial payouts.

## P2 (product improvements)

1. `create_human_verification_request`
   - KYC/identity request for a contractor.
2. `review_human_verification_request`
   - Human approval/reject of contractor verification.
3. `create_reputation_snapshot`
   - Reputation snapshot for a date (for scoring/history).
4. `recommend_budget_for_task`
   - Budget recommendation based on market and historical data.
5. `summarize_conversation`
   - Concise conversation summary + next actions.
6. `generate_handoff_brief`
   - Generates a handoff brief for a human before a task.

## Next implementation order

1. KYC/reputation/assistive tools from P2.

## Required process for any new tool

- Request via `request_mcp_tool_creation`.
- Clear input/output schema.
- Threat model and abuse cases.
- Human review approval before merge.
