# System Overview

Short architecture documentation for `skinbag.rent`.

## 1) Components

- `src/server.ts` - HTTP API, auth, middleware, static frontend.
- `src/mcpServer.ts` - MCP server (stdio) with tool handlers.
- `src/services/*.ts` - business logic:
  - `rentService.ts` - humans/conversations/bounties/bookings
  - `paymentService.ts` - wallets/policies/payouts/events
  - `compatApiService.ts` - legacy-compatible API layer
  - `mcpToolRequestService.ts` - intake flow for new MCP tools
  - `profileService.ts` - profile/onboarding/verify email
- `src/routes/*.ts` - REST endpoints by domain.
- `src/db/init.ts` - DB schema + seed + migrations.
- `public/*.html` - landing, login, dashboard.

## 2) Runtime flows

### HTTP API

1. Express middleware stack (helmet/cors/session/passport/csrf/rate-limit).
2. Routes `/api/*` and static frontend.
3. Business logic in services, persistence via Postgres (`DATABASE_URL`) with SQLite fallback for local development.

### MCP API

1. MCP client sends a tool call.
2. `mcpServer.ts` validates input with Zod.
3. Calls the service layer with user context from `MCP_DEFAULT_USER_EMAIL`.
4. Returns JSON payload in MCP text content.

## 3) Data model (core)

- `users` - accounts and roles.
- `humans`, `human_skills`, `skills`, `reviews` - human profiles and skill catalogs.
- `conversations`, `messages` - communications.
- `bounties`, `bounty_applications` - bounty/tender flow.
- `bookings`, `api_bookings` - bookings (internal + compat).
- `human_wallets`, `payment_policies`, `crypto_payouts`, `payout_events` - crypto payments.
- `mcp_tool_requests`, `mcp_tool_pr_drafts` - factory flow for new MCP tools.
- `human_profile_settings`, `user_email_verification_tokens`, `user_sessions` - profile and auth/session.

## 4) Security controls (implemented)

- Cookie auth + CSRF for browser flow.
- Rate limiting for auth and compat API.
- Login anti-bruteforce.
- API keys for compat API with scope model (`compat:read/write/admin`).
- Human-review gate for new MCP tools.
- For `agent_auto` payouts, a `verified` wallet is required.
- Compat humans API does not return email.

## 5) Production assumptions

- Current deployment target: **single-instance**.
- Limit/bruteforce stores are in-memory; horizontal scale needs a shared backend (Redis/DB counter store).
- Production DB: Postgres (`DATABASE_URL`), local fallback: SQLite (`data/rent.db`).

## 6) Known gaps / next hardening steps

- Full escrow/dispute flow for payments.
- Webhook/outbox for payout/booking events.
- Separate read-models for analytics.
- Stronger policy engine (risk score, chain-specific controls).
- Explicit compatibility versioning for compat API and MCP contract.
