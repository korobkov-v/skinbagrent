# REST API Guide

Detailed overview of the HTTP API for `skinbag.rent`.

## Base URL

- Local dev: `http://localhost:4000`
- API prefix: `/api`

## MCP endpoint

- Hosted MCP transport endpoint: `POST/GET/DELETE /mcp`
- Recommended client config:

```json
{
  "mcpServers": {
    "skinbag": {
      "url": "https://skinbag.rent/mcp"
    }
  }
}
```

## Auth modes

### Browser/session mode (primary UI)

- Cookie-based auth (`rent_token` + session).
- Mutating requests require a CSRF token:
  1. `GET /api/auth/csrf`
  2. Send `x-csrf-token` in `POST/PATCH/DELETE`

### Compat API key mode (agent integration)

- Used for legacy compat endpoints.
- Send one of:
  - `x-api-key: <key>`
  - `Authorization: Bearer <key>`
- Scopes:
  - `compat:read`
  - `compat:write`
  - `compat:admin`

## Core domains

## 1) Auth

- Browser authentication uses Google OAuth only.
- `POST /api/auth/firebase`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/csrf`
- `GET /api/auth/api-keys` (admin)
- `POST /api/auth/api-keys` (admin)
- `POST /api/auth/api-keys/:keyId/revoke` (admin)
- `GET /auth/google`
- `GET /auth/google/callback`

## 2) Humans & Skills

- `GET /api/skills`
- `GET /api/humans`
- `GET /api/humans/:humanId`
- `GET /api/humans/:humanId/reviews`
- `GET /api/humans/:humanId/availability-windows`
- `POST /api/humans/:humanId/availability-windows` (owner/admin)
- `POST /api/humans` (compat create-style route)

## 3) Conversations

- `POST /api/conversations`
- `GET /api/conversations`
- `GET /api/conversations/:conversationId`
- `POST /api/conversations/:conversationId/messages`

## 4) Bounties

- `POST /api/bounties`
- `GET /api/bounties`
- `GET /api/bounties/:bountyId`
- `PATCH /api/bounties/:bountyId`
- `GET /api/bounties/:bountyId/applications`
- `POST /api/bounties/:bountyId/applications`
- `POST /api/bounties/:bountyId/applications/:applicationId/accept`
- `GET /api/bounties/:bountyId/matches`

## 5) Bookings

- `POST /api/bookings`
- `GET /api/bookings/:bookingId`
- `PATCH /api/bookings/:bookingId`

## 6) Payments

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

## 7) Profile & onboarding

- `GET /api/profile/me`
- `GET /api/profile/notifications`
- `PATCH /api/profile/me`
- `POST /api/profile/skills`
- `DELETE /api/profile/skills/:skillSlug`
- `POST /api/profile/email/resend`
- `POST /api/profile/email/verify`
- `GET /verify-email?token=...`

## 8) MCP tool requests (human review gate)

- `POST /api/mcp-tools/requests`
- `GET /api/mcp-tools/requests`
- `GET /api/mcp-tools/requests/:requestId`
- `POST /api/mcp-tools/requests/:requestId/review`
- `POST /api/mcp-tools/requests/:requestId/implemented`

## 9) Marketplace stats

- `GET /api/stats`

## Security-relevant behavior

- Compat humans endpoints do not return email.
- For `agent_auto` payouts, a `verified` wallet is required.
- Wallet challenge and escrow/dispute endpoints require session auth.
- Payout lifecycle webhook deliveries are available as an audit log (`/api/payout-webhooks/deliveries`).
- Availability windows can only be changed by the human profile owner or admin.
- Input validation via Zod at the route handler level.

## Machine-readable docs

- `GET /api-docs` - JSON catalog of endpoints and MCP tool metadata.
