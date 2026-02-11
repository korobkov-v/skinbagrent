# Skinbag.rent MCP Service

Open-source MCP + REST service for human rentals:

- Open source (MIT)
- Express API + PostgreSQL (SQLite fallback for local development)
- MCP server (stdio) with a set of tools
- Minimal frontend: Google OAuth authentication

## What's implemented

### MCP tools

- Discovery/Profile: `get_agent_identity`, `search_humans`, `get_human`, `list_skills`, `get_reviews`
- Conversations: `start_conversation`, `send_message`, `get_conversation`, `list_conversations`
- Bounties: `create_bounty`, `list_bounties`, `get_bounty`, `get_bounty_applications`, `accept_application`, `update_bounty`, `match_humans_for_bounty`
- Availability: `set_human_availability_window`
- Bookings: `book_human`, `get_booking`, `update_booking`
- Crypto Payments: `list_payment_networks`, `estimate_payout_fees`, `create_payout_webhook_subscription`, `list_payout_webhook_deliveries`, `create_booking_milestone`, `list_booking_milestones`, `complete_booking_milestone`, `register_human_wallet`, `list_human_wallets`, `create_wallet_verification_challenge`, `verify_wallet_signature`, `get_payment_policy`, `update_payment_policy`, `create_escrow_hold`, `release_escrow_hold`, `open_dispute`, `resolve_dispute`, `create_crypto_payout`, `list_crypto_payouts`, `get_crypto_payout`, `approve_crypto_payout`, `execute_crypto_payout`, `fail_crypto_payout`, `get_payout_events`
- Tool Factory: `request_mcp_tool_creation`, `list_mcp_tool_creation_requests`, `get_mcp_tool_creation_request`

Full reference with arguments, statuses, and workflows:

- `docs/MCP_TOOLS.md`

### REST API

- `POST /api/auth/firebase`
- `GET /api/auth/csrf`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/api-keys` (admin)
- `POST /api/auth/api-keys` (admin)
- `POST /api/auth/api-keys/:keyId/revoke` (admin)
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /verify-email?token=...`
- `GET /api/skills`
- `POST /api/humans`
- `GET /api/humans?skill=&minRate=&maxRate=&name=&limit=&offset=`
- `GET /api/humans/:id`
- `GET /api/humans/:humanId/reviews`
- `GET /api/humans/:humanId/availability-windows`
- `POST /api/humans/:humanId/availability-windows`
- `POST /api/conversations`
- `POST /api/conversations/:conversationId/messages`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId`
- `POST /api/bounties`
- `PATCH /api/bounties/:bountyId`
- `GET /api/bounties`
- `GET /api/bounties/:bountyId`
- `GET /api/bounties/:bountyId/applications`
- `POST /api/bounties/:bountyId/applications`
- `POST /api/bounties/:bountyId/applications/:applicationId/accept`
- `GET /api/bounties/:bountyId/matches`
- `GET /api/bookings?humanId=&agentId=&status=&limit=&offset=`
- `POST /api/bookings`
- `GET /api/bookings/:id`
- `PATCH /api/bookings/:id`
- `GET /api/payments/networks`
- `POST /api/payouts/estimate-fees`
- `POST /api/payout-webhooks/subscriptions`
- `GET /api/payout-webhooks/subscriptions`
- `GET /api/payout-webhooks/deliveries`
- `GET /api/payment-policy`
- `PATCH /api/payment-policy`
- `GET /api/humans/:humanId/wallets`
- `POST /api/humans/:humanId/wallets`
- `POST /api/humans/:humanId/wallet-verification-challenges`
- `GET /api/humans/:humanId/wallet-verification-challenges`
- `POST /api/wallet-verification/verify`
- `POST /api/escrows`
- `GET /api/escrows`
- `GET /api/escrows/:escrowId`
- `GET /api/escrows/:escrowId/events`
- `POST /api/escrows/:escrowId/release`
- `POST /api/disputes`
- `GET /api/disputes`
- `GET /api/disputes/:disputeId`
- `GET /api/disputes/:disputeId/events`
- `POST /api/disputes/:disputeId/resolve` (admin)
- `POST /api/milestones`
- `GET /api/milestones`
- `POST /api/milestones/:milestoneId/complete`
- `POST /api/payouts`
- `GET /api/payouts`
- `GET /api/payouts/:payoutId`
- `GET /api/payouts/:payoutId/events`
- `POST /api/payouts/:payoutId/approve`
- `POST /api/payouts/:payoutId/execute`
- `POST /api/payouts/:payoutId/fail`
- `GET /api/profile/me`
- `GET /api/profile/notifications`
- `PATCH /api/profile/me`
- `POST /api/profile/skills`
- `DELETE /api/profile/skills/:skillSlug`
- `POST /api/profile/email/resend`
- `POST /api/profile/email/verify`
- `POST /api/mcp-tools/requests`
- `GET /api/mcp-tools/requests`
- `GET /api/mcp-tools/requests/:requestId`
- `POST /api/mcp-tools/requests/:requestId/review`
- `POST /api/mcp-tools/requests/:requestId/implemented`

## Crypto Payments (Architecture)

- Humans specify crypto wallets in `human_wallets` (chain/network/token/address).
- Wallet ownership verification uses a challenge flow:
  - `create_wallet_verification_challenge`
  - `verify_wallet_signature`
- The payer configures policy in `payment_policies`:
  - whether agent auto payout is enabled;
  - whether manual approval is required;
  - limits per payout and per day;
  - allowlist of networks and tokens.
- Payouts go through the `crypto_payouts` pipeline:
  1. `pending` (intent created)
  2. `approved` (manual or auto approve per policy)
  3. `submitted` (agent sent the transaction)
  4. `confirmed` or `failed`
- Full audit trail is recorded in `payout_events`.
- Conditional payouts use escrow/dispute primitives:
  - `escrow_holds` + `escrow_events`
  - `disputes` + `dispute_events`
- In demo mode, `execute_crypto_payout` generates a simulated on-chain tx hash. For production, connect a real signer/agent wallet.

## Compatibility with legacy `api-docs` format

- Added analogous endpoint shapes for `humans` and `bookings`.
- Response format for these endpoints: `{"success": true, ...}` and errors `{"success": false, "error": "..."}`.
- For `POST /api/humans`, `cryptoWallets` is supported so the agent can later use them in the payout pipeline.
- Compat API is now protected by an API key (`x-api-key` or `Authorization: Bearer <key>`), and supports scopes: `compat:read`, `compat:write`, `compat:admin`.
- `agentId` in bookings is tied to the API key (unless the key is `compat:admin`).
- Rate limiting is enabled for the compat API (global and separate limits for write requests).

## Security (new)

- CSRF protection for cookie-based `/api/*` requests (via `GET /api/auth/csrf` + `x-csrf-token` header).
- Anti-bruteforce for login: lock after a series of failed attempts.
- Rate limiting for auth endpoints.
- Session storage moved from in-memory to DB (`user_sessions`) for production scenarios.
- Compat `GET /api/humans*` does not return the human's email.
- `agent_auto` payouts are allowed only to wallets with `verified` status.

## User Profile

In `public/app.html` and `/api/profile/*`, the following fields and flows are implemented:

- verify email (`resend`, `I've verified`)
- email verification now happens only via `/verify-email?token=...` link from the email (in dev the link is logged to the server console)
- completion checklist: name / skill / wallet
- name, headline, bio
- city, state, country
- available (accepting bookings), show email
- skills add/remove
- social links: twitter, linkedin, github, website, instagram, youtube
- rate ($/hr), timezone
- onboarding notifications logic:
  - `verify your email` + actions `I've verified` / `resend`
  - `complete your profile` + checklist (`Add your name`, `Add at least one skill`, `Add a payment wallet`)
  - resend cooldown to prevent spam (60s)

## Quick Start

```bash
cp .env.example .env
npm install
npm run dev
```

Smoke tests:

```bash
npm test
```

HTTP E2E (real requests to a running server):

```bash
npm run test:e2e:http
```

> In sandbox environments without permission to bind to localhost, tests will be skipped automatically.

UI E2E (Playwright):

```bash
npm run test:e2e:ui
```

If Playwright/Chromium are not installed, tests will be skipped.
For a full run:

```bash
npm i -D playwright
npx playwright install chromium
```

One-time SQLite -> Postgres data migration:

```bash
DATABASE_URL=postgresql://... SOURCE_SQLITE_FILE=./data/rent.db npm run migrate:sqlite-to-postgres
```

Open:

- Frontend: `http://localhost:4000`
- API docs: `http://localhost:4000/api-docs`

Demo user (seed):

- Email: `demo@rent.local`
- Password: `demo1234`

Admin (seed):

- Email: `owner@rent.local`
- Password: `owner1234`

Demo compat API key (dev):

- `sbr_demo_local_key` (or the value of `COMPAT_DEMO_API_KEY` in `.env`)

## Run MCP server

In a separate terminal tab:

```bash
npm run dev:mcp
```

MCP runs over `stdio`, so connect from an MCP-compatible client using a Node launch command.

### Hosted MCP endpoint

Public endpoint:

- `https://skinbag.rent/mcp`

Example MCP client configuration:

```json
{
  "mcpServers": {
    "skinbag": {
      "url": "https://skinbag.rent/mcp"
    }
  }
}
```

### Optional npm package (`npx`)

If you want to run via npm package, use:

```bash
npx -y skinbag-mcp
```

Quick validation:

```bash
npm view skinbag-mcp version
```

## Structure

- `src/server.ts` - HTTP API + static frontend
- `src/mcpServer.ts` - MCP server tools
- `src/services/rentService.ts` - business logic
- `src/services/paymentService.ts` - wallets/payouts/policy
- `src/db/init.ts` - schema and seed data
- `public/` - minimal UI

## Documentation

- MCP tools reference: `docs/MCP_TOOLS.md`
- REST API guide: `docs/REST_API.md`
- Architecture and data model: `docs/SYSTEM_OVERVIEW.md`
- New MCP tool ideas: `docs/MCP_TOOL_IDEAS.md`
- Public docs pages:
  - `http://localhost:4000/docs`
  - `http://localhost:4000/docs/mcp-tools`
  - `http://localhost:4000/docs/rest-api`

## Notes

- Authentication and registration are available only through Google OAuth.
- Production uses Postgres (`DATABASE_URL`); locally you can use SQLite fallback (`DB_FILE`).

## Open Source

- License: MIT (`LICENSE`)
- You can freely use, modify, and fork the project.
- Contribution rules and PR process: `CONTRIBUTING.md`

## MCP Tool Factory (human review gate)

- An agent can create a request for a new MCP tool via `request_mcp_tool_creation`.
- The request gets status `pending_human_review`.
- Until human review, the feature is not considered approved.
- For PR mode, a draft is created with branch prefix `codex/` and a human-review checklist.
