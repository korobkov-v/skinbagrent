# MCP Tools Reference (skinbag.rent)

Full reference for MCP tools implemented in `src/mcpServer.ts`.

## General rules

- Transport: MCP server runs over `stdio`.
- User context: all calls run in the context of `MCP_DEFAULT_USER_EMAIL` from `.env`.
- Response format: JSON in text `content` (MCP `type: "text"`).
- Error format: tool returns `isError: true` + error text (validation, not found, business rules).
- Privacy: compat human profiles do not include email.
- Payment safety: `agent_auto` payouts are allowed only to `verified` wallets.

## Tool groups

### 1) Discovery & Profiles

| Tool | Purpose | Required args | Response keys | Notes |
|---|---|---|---|---|
| `get_agent_identity` | MCP agent metadata | - | `id`, `name`, `capabilities`, `docs_url` | Quick health/info check |
| `search_humans` | Search humans by filters | - | `humans[]` | Filters: `query`, `skill`, `min/max_hourly_rate_cents`, `available_only`, pagination |
| `get_human` | Human profile card | `human_id` | `human` | Error: `Human not found` |
| `list_skills` | Skills directory | - | `skills[]` | Supports `query` |
| `get_reviews` | Reviews for a human | `human_id` | `reviews[]` | Supports `limit`, `offset` |

### 2) Conversations

| Tool | Purpose | Required args | Response keys | Notes |
|---|---|---|---|---|
| `start_conversation` | Create a conversation + first message | `human_id`, `message` | `conversation`, `message` | `subject` optional |
| `send_message` | Send a message in a conversation | `conversation_id`, `message` | `message` | Error: closed/not found |
| `get_conversation` | Get a conversation with history | `conversation_id` | `conversation`, `human`, `messages[]` | Error: `Conversation not found` |
| `list_conversations` | List a user's conversations | - | `conversations[]` | Filters: `status`, pagination |

### 3) Bounties

| Tool | Purpose | Required args | Response keys | Notes |
|---|---|---|---|---|
| `create_bounty` | Create a task (bounty) | `title`, `description`, `budget_cents` | `bounty` | `currency`, `skill_slug` optional |
| `list_bounties` | List bounties | - | `bounties[]` | Filters: `status`, pagination |
| `get_bounty` | Get a bounty | `bounty_id` | `bounty` | Error: `Bounty not found` |
| `get_bounty_applications` | List applications for a bounty | `bounty_id` | `applications[]` | Filter: `status` |
| `accept_application` | Accept one application | `bounty_id`, `application_id` | `bounty`, `application` | Other applications are marked as `rejected` |
| `update_bounty` | Update a bounty | `bounty_id` | `bounty` | Can change `title`, `description`, `budget_cents`, `skill_slug`, `status` |
| `match_humans_for_bounty` | Rank candidates for a bounty | `bounty_id` | `bounty`, `candidates[]`, `generated_at` | Scoring by skill/budget/rating/availability |

### 4) Bookings

| Tool | Purpose | Required args | Response keys | Notes |
|---|---|---|---|---|
| `book_human` | Create a booking for a period | `human_id`, `starts_at`, `ends_at` | `booking` | Interval validity is checked |
| `get_booking` | Get a booking | `booking_id` | `booking` | Error: `Booking not found` |
| `update_booking` | Update a booking | `booking_id` | `booking` | Statuses: `requested/confirmed/cancelled/completed` |

### 5) Availability

| Tool | Purpose | Required args | Response keys | Notes |
|---|---|---|---|---|
| `set_human_availability_window` | Create/update a weekly availability slot | `human_id`, `day_of_week`, `start_time`, `end_time` | `window`, `windows[]` | Time format: `HH:MM` (24h), timezone can be overridden |

### 6) Crypto Payments

| Tool | Purpose | Required args | Response keys | Notes |
|---|---|---|---|---|
| `list_payment_networks` | Network/status catalog | - | `chains`, `networks`, `payout_statuses` | Use before payout validation |
| `estimate_payout_fees` | Preliminary fee/net estimate | `chain`, `network`, `token_symbol`, `amount_cents` | `estimate` | Returns network/platform fee and net to recipient |
| `create_payout_webhook_subscription` | Create webhook subscription for payout lifecycle | `endpoint_url` | `subscription` | Events can be filtered (`events`), `*` = all payout events |
| `list_payout_webhook_deliveries` | Webhook delivery logs | - | `deliveries[]` | Filters: `subscription_id`, `payout_id`, `delivery_status` |
| `register_human_wallet` | Add/update a human wallet | `human_id`, `chain`, `network`, `token_symbol`, `address` | `wallet` | Address validation by chain |
| `list_human_wallets` | List a human's wallets | `human_id` | `wallets[]` | Sorting: default first |
| `get_payment_policy` | Current payout policy | - | `policy` | Policy is tied to current user context |
| `update_payment_policy` | Update payout policy | - | `policy` | Limits + chain/token allowlist |
| `create_crypto_payout` | Create a payout intent | `source_type`, `chain`, `network`, `token_symbol`, `execution_mode` | `payout` | For `manual`: need `human_id`,`amount_cents`; for `bounty/booking`: `source_id` |
| `list_crypto_payouts` | List payouts | - | `payouts[]` | Filters: `status`, `source_type`, pagination |
| `get_crypto_payout` | Payout details | `payout_id` | `payout` | Error: `Payout not found` |
| `approve_crypto_payout` | Manually approve a pending payout | `payout_id` | `payout` | Only from `pending` |
| `execute_crypto_payout` | Execute payout by agent | `payout_id`, `agent_id` | `payout` | Allowed only for `execution_mode=agent_auto` |
| `fail_crypto_payout` | Fail a payout with a reason | `payout_id`, `reason` | `payout` | Records an audit event |
| `get_payout_events` | Audit payout events | `payout_id` | `events[]` | Status and actor sequence |
| `create_booking_milestone` | Create a milestone for booking/bounty | `source_type`, `source_id`, `title`, `amount_cents` | `milestone` | Milestone amount is limited by source budget/price |
| `list_booking_milestones` | List milestones | - | `milestones[]` | Filters: `source_type`, `source_id`, `status`, pagination |
| `complete_booking_milestone` | Complete a milestone (+ optional payout) | `milestone_id` | `milestone`, `payout?` | With `auto_create_payout=true` you can create a payout immediately |
| `create_wallet_verification_challenge` | Create a challenge to verify wallet ownership | `human_id` | `challenge` | Supports selection by `wallet_id`/`chain`/`network`/`token_symbol`/`address` |
| `verify_wallet_signature` | Verify a challenge and mark wallet as verified | `human_id`, `challenge_id`, `signature` | `verification`, `latest_verified_challenges[]` | Demo flow: deterministic signature format |
| `create_escrow_hold` | Create an escrow hold for booking/bounty/manual | `source_type`, `chain`, `network`, `token_symbol` | `escrow` | For `manual`: need `human_id`,`amount_cents`; for `bounty/booking`: `source_id` |
| `release_escrow_hold` | Release escrow into the payout pipeline | `escrow_id`, `execution_mode` | `escrow`, `payout`, `escrowEvents[]` | For `agent_auto`, `requested_by_agent_id` is required |
| `open_dispute` | Open a dispute for `booking/payout/escrow/bounty` | `target_type`, `target_id`, `reason` | `dispute` | Dispute is tied to the user context of the target owner |
| `resolve_dispute` | Resolve a dispute with reviewer decision | `dispute_id`, `reviewer_user_id`, `decision` | `dispute`, `events[]` | Final decision is made by a human |

### 7) MCP Tool Factory (Human Review Gate)

| Tool | Purpose | Required args | Response keys | Notes |
|---|---|---|---|---|
| `request_mcp_tool_creation` | Request a new MCP tool | `requested_by_agent_id`, `tool_name`, `tool_description`, `reason`, `input_schema` | `request`, `prDraft?`, `humanReviewRequired` | All requests require human review |
| `list_mcp_tool_creation_requests` | List requests for new tools | - | `requests[]`, `note` | Filter by `status`, pagination |
| `get_mcp_tool_creation_request` | Details for one request | `request_id` | `request`, `prDraft?` | Error: `...not found` |

## Typical workflows

### A) Find a human and book

1. `search_humans`
2. `get_human`
3. `start_conversation` (optional)
4. `book_human`
5. `get_booking` / `update_booking`

### B) Bounty-to-Payout

1. `create_bounty`
2. `get_bounty_applications`
3. `accept_application`
4. `create_crypto_payout`
5. `approve_crypto_payout` (if policy requires)
6. `execute_crypto_payout`
7. `get_payout_events`

### C) Request a new MCP tool

1. `request_mcp_tool_creation`
2. `list_mcp_tool_creation_requests`
3. `get_mcp_tool_creation_request`
4. Then human review outside of the MCP tool call

### D) Wallet verification + escrow + dispute

1. `create_wallet_verification_challenge`
2. Sign the challenge on the wallet side (demo deterministic flow)
3. `verify_wallet_signature`
4. `create_escrow_hold`
5. `release_escrow_hold`
6. If disputed: `open_dispute` -> `resolve_dispute`

### E) Fee estimation + webhook audit

1. `estimate_payout_fees`
2. `create_payout_webhook_subscription`
3. Execute the payout flow (`create_crypto_payout`, `approve`, `execute`)
4. `list_payout_webhook_deliveries`

### F) Availability-driven bounty matching

1. `set_human_availability_window`
2. `match_humans_for_bounty`

### G) Milestone-driven partial payouts

1. `create_booking_milestone`
2. `list_booking_milestones`
3. `complete_booking_milestone` (optional payout)

## Statuses (quick reference)

- Bounty: `open`, `in_review`, `in_progress`, `completed`, `cancelled`
- Booking: `requested`, `confirmed`, `cancelled`, `completed`
- Payout: `pending`, `approved`, `submitted`, `confirmed`, `failed`, `cancelled`
- Wallet challenge: `pending`, `verified`, `expired`, `rejected`
- Escrow: `held`, `released`, `cancelled`, `expired`
- Dispute: `open`, `under_review`, `resolved`, `rejected`
- MCP Tool Request: `pending_human_review`, `approved`, `rejected`, `implemented`

## Current limitations

- Single-tenant MCP context: one user context from `MCP_DEFAULT_USER_EMAIL`.
- `execute_crypto_payout` uses a simulated tx hash by default (dev/demo).
- Wallet ownership verification is currently a demo deterministic signature flow.
- Dispute resolution does not automatically perform on-chain arbitration/reversal.
- Webhook deliveries are currently in a simulated outbox model (no external HTTP call).
