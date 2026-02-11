import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbFile = path.join(
  os.tmpdir(),
  `skinbag-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}.db`
);

let modules;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.APP_URL = "http://localhost:4000";
  process.env.DB_FILE = dbFile;
  process.env.JWT_SECRET = "smoke-test-secret";
  process.env.COMPAT_DEMO_API_KEY = "sbr_test_key";

  const init = await import("../dist/db/init.js");
  init.initializeDatabase();

  modules = {
    compatApiKey: await import("../dist/services/compatApiKeyService.js"),
    compatApi: await import("../dist/services/compatApiService.js"),
    payment: await import("../dist/services/paymentService.js"),
    loginSecurity: await import("../dist/services/loginSecurityService.js"),
    rent: await import("../dist/services/rentService.js"),
    rateLimit: await import("../dist/middleware/rateLimit.js"),
    csrf: await import("../dist/middleware/csrf.js"),
    auth: await import("../dist/services/authService.js"),
    profile: await import("../dist/services/profileService.js"),
    db: await import("../dist/db/client.js")
  };
});

after(() => {
  fs.rmSync(dbFile, { force: true });
  fs.rmSync(`${dbFile}-wal`, { force: true });
  fs.rmSync(`${dbFile}-shm`, { force: true });
});

test("compat API key lifecycle works", () => {
  const { createCompatApiKey, authenticateCompatApiKey, revokeCompatApiKey } = modules.compatApiKey;

  const created = createCompatApiKey({
    name: "Smoke Key",
    agentId: "agent_smoke",
    scopes: ["compat:read", "compat:write"]
  });

  assert.ok(created.apiKey.startsWith("sbr_live_"));
  assert.equal(created.key.agent_id, "agent_smoke");

  const authContext = authenticateCompatApiKey(created.apiKey);
  assert.ok(authContext);
  assert.equal(authContext.agentId, "agent_smoke");

  revokeCompatApiKey(created.key.id);
  const afterRevoke = authenticateCompatApiKey(created.apiKey);
  assert.equal(afterRevoke, null);
});

test("login brute-force guard locks after repeated failures", () => {
  const {
    buildLoginAttemptKey,
    getLoginGuardState,
    registerFailedLoginAttempt,
    clearLoginFailureState
  } = modules.loginSecurity;

  const key = buildLoginAttemptKey("127.0.0.1", "demo@rent.local");
  clearLoginFailureState(key);

  for (let i = 0; i < 5; i += 1) {
    registerFailedLoginAttempt(key);
  }

  const guard = getLoginGuardState(key);
  assert.equal(guard.allowed, false);
  assert.ok(guard.retryAfterSeconds > 0);

  clearLoginFailureState(key);
  const afterClear = getLoginGuardState(key);
  assert.equal(afterClear.allowed, true);
});

test("rate limiter blocks after max requests", () => {
  const { createRateLimiter } = modules.rateLimit;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, message: "Rate limited" });

  const req = {
    ip: "127.0.0.1",
    header: () => null
  };

  const makeRes = () => {
    const payload = {
      statusCode: 200,
      body: null
    };
    return {
      payload,
      setHeader() {},
      status(code) {
        payload.statusCode = code;
        return this;
      },
      json(data) {
        payload.body = data;
        return this;
      }
    };
  };

  let nextCalls = 0;
  limiter(req, makeRes(), () => {
    nextCalls += 1;
  });
  limiter(req, makeRes(), () => {
    nextCalls += 1;
  });

  const blockedRes = makeRes();
  limiter(req, blockedRes, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 2);
  assert.equal(blockedRes.payload.statusCode, 429);
  assert.equal(blockedRes.payload.body.error, "Rate limited");
});

test("request ip prefers express-resolved ip over spoofable headers", () => {
  const { getRequestIp } = modules.rateLimit;
  const req = {
    ip: "127.0.0.1",
    socket: { remoteAddress: "10.0.0.8" },
    header: (name) => {
      if (name.toLowerCase() === "x-forwarded-for") {
        return "203.0.113.10";
      }
      if (name.toLowerCase() === "x-real-ip") {
        return "198.51.100.4";
      }
      return null;
    }
  };

  assert.equal(getRequestIp(req), "127.0.0.1");
});

test("csrf middleware requires token for mutating requests", () => {
  const { csrfProtection } = modules.csrf;

  const makeRes = () => {
    const payload = {
      statusCode: 200,
      body: null
    };
    return {
      payload,
      status(code) {
        payload.statusCode = code;
        return this;
      },
      json(data) {
        payload.body = data;
        return this;
      }
    };
  };

  const reqGet = {
    method: "GET",
    session: {},
    compatApiKey: undefined,
    cookies: {},
    header: () => null
  };

  let getNext = false;
  csrfProtection(reqGet, makeRes(), () => {
    getNext = true;
  });
  assert.equal(getNext, true);
  assert.ok(typeof reqGet.session.csrfToken === "string");

  const reqPostNoToken = {
    method: "POST",
    session: { csrfToken: reqGet.session.csrfToken },
    compatApiKey: undefined,
    cookies: {},
    header: () => null
  };
  const postNoTokenRes = makeRes();
  csrfProtection(reqPostNoToken, postNoTokenRes, () => {});
  assert.equal(postNoTokenRes.payload.statusCode, 403);
  assert.equal(postNoTokenRes.payload.body.error, "Invalid CSRF token");

  const reqPostOk = {
    method: "POST",
    session: { csrfToken: reqGet.session.csrfToken },
    compatApiKey: undefined,
    cookies: {},
    header: (name) => (name.toLowerCase() === "x-csrf-token" ? reqGet.session.csrfToken : null)
  };
  let postNext = false;
  csrfProtection(reqPostOk, makeRes(), () => {
    postNext = true;
  });
  assert.equal(postNext, true);
});

test("compat API never exposes human email", () => {
  const { createApiHuman, getApiHuman, listApiHumans } = modules.compatApi;
  const { db } = modules.db;

  const email = `compat-${Date.now()}@example.com`;
  const created = createApiHuman({
    name: "Compat Hidden Human",
    email,
    skills: ["field-research"],
    cryptoWallets: [
      {
        chain: "polygon",
        network: "mainnet",
        tokenSymbol: "USDC",
        address: "0x1111111111111111111111111111111111111111"
      }
    ]
  });

  assert.ok(created?.id);
  assert.equal("email" in created, false);

  const hiddenById = getApiHuman(created.id);
  assert.ok(hiddenById);
  assert.equal("email" in hiddenById, false);

  const hiddenFromList = listApiHumans({ name: "Compat Hidden Human", limit: 20, offset: 0 });
  const hiddenListRow = hiddenFromList.find((human) => human.id === created.id);
  assert.ok(hiddenListRow);
  assert.equal("email" in hiddenListRow, false);

  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO human_profile_settings (
      human_id, city, state, country, show_email, social_links_json, photos_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(human_id) DO UPDATE SET show_email = excluded.show_email, updated_at = excluded.updated_at`
  ).run(created.id, null, null, null, 1, JSON.stringify({}), JSON.stringify([]), ts, ts);

  const visibleById = getApiHuman(created.id);
  assert.ok(visibleById);
  assert.equal("email" in visibleById, false);
});

test("agent_auto payouts require a verified wallet", () => {
  const { createApiHuman } = modules.compatApi;
  const { createCryptoPayoutIntent, updatePaymentPolicy } = modules.payment;
  const { db } = modules.db;

  const demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@rent.local");
  assert.ok(demoUser?.id);

  updatePaymentPolicy({
    userId: demoUser.id,
    autopayEnabled: true,
    requireApproval: true,
    maxSinglePayoutCents: 150000,
    maxDailyPayoutCents: 500000,
    allowedChains: ["polygon"],
    allowedTokens: ["USDC"]
  });

  const created = createApiHuman({
    name: "Unverified Wallet Human",
    email: `wallet-${Date.now()}@example.com`,
    skills: ["local-errands"],
    cryptoWallets: [
      {
        chain: "polygon",
        network: "mainnet",
        tokenSymbol: "USDC",
        address: "0x2222222222222222222222222222222222222222"
      }
    ]
  });

  assert.throws(
    () =>
      createCryptoPayoutIntent({
        userId: demoUser.id,
        sourceType: "manual",
        humanId: created.id,
        amountCents: 1000,
        chain: "polygon",
        network: "mainnet",
        tokenSymbol: "USDC",
        executionMode: "agent_auto",
        requestedByAgentId: "agent_smoke"
      }),
    /Wallet must be verified for agent_auto payouts/
  );
});

test("wallet verification challenge flow marks wallet as verified", () => {
  const { createWalletVerificationChallenge, verifyWalletSignature, upsertHumanWallet } = modules.payment;
  const { db } = modules.db;

  const human = db
    .prepare("SELECT id, display_name FROM humans ORDER BY created_at ASC LIMIT 1")
    .get();
  assert.ok(human?.id);

  const wallet = upsertHumanWallet({
    humanId: human.id,
    label: `${human.display_name} temp wallet`,
    chain: "polygon",
    network: "mainnet",
    tokenSymbol: "USDC",
    address: "0x3333333333333333333333333333333333333333",
    isDefault: false,
    verificationStatus: "unverified"
  });
  assert.equal(wallet.verification_status, "unverified");

  const challenge = createWalletVerificationChallenge({
    humanId: human.id,
    walletId: wallet.id,
    expiresInMinutes: 10
  });
  assert.equal(challenge.status, "pending");
  assert.ok(challenge.challenge);

  const signature = `demo_sig_${createHash("sha256").update(`${wallet.address.toLowerCase()}|${challenge.challenge}`).digest("hex")}`;
  const verified = verifyWalletSignature({
    challengeId: challenge.id,
    signature,
    expectedHumanId: human.id
  });

  assert.equal(verified.verified, true);
  assert.equal(verified.challenge.status, "verified");
  assert.equal(verified.wallet.verification_status, "verified");
});

test("escrow hold release creates payout and dispute can be resolved", () => {
  const { createEscrowHold, releaseEscrowHold, openDispute, resolveDispute } = modules.payment;
  const { db } = modules.db;

  const demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@rent.local");
  assert.ok(demoUser?.id);

  const human = db.prepare("SELECT id FROM humans ORDER BY created_at ASC LIMIT 1").get();
  assert.ok(human?.id);

  const escrow = createEscrowHold({
    userId: demoUser.id,
    sourceType: "manual",
    humanId: human.id,
    amountCents: 2500,
    chain: "polygon",
    network: "testnet",
    tokenSymbol: "USDC",
    note: "smoke escrow"
  });
  assert.equal(escrow.status, "held");

  const released = releaseEscrowHold({
    userId: demoUser.id,
    escrowId: escrow.id,
    executionMode: "manual"
  });
  assert.equal(released.escrow.status, "released");
  assert.equal(released.payout.source_type, "manual");
  assert.equal(released.payout.status, "pending");

  const dispute = openDispute({
    userId: demoUser.id,
    targetType: "escrow",
    targetId: escrow.id,
    reason: "Need human review of release conditions"
  });
  assert.equal(dispute.status, "open");

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get();
  assert.ok(admin?.id);

  const resolved = resolveDispute({
    disputeId: dispute.id,
    reviewerUserId: admin.id,
    decision: "release",
    note: "Approved by smoke test admin"
  });
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution, "release");
});

test("estimate payout fees returns positive totals", () => {
  const { estimatePayoutFees } = modules.payment;

  const estimate = estimatePayoutFees({
    chain: "polygon",
    network: "mainnet",
    tokenSymbol: "usdc",
    amountCents: 25_000,
    executionMode: "agent_auto"
  });

  assert.equal(estimate.token_symbol, "USDC");
  assert.equal(estimate.amount_cents, 25_000);
  assert.ok(estimate.estimated_network_fee_cents > 0);
  assert.ok(estimate.estimated_platform_fee_cents > 0);
  assert.ok(estimate.estimated_total_debit_cents > estimate.amount_cents);
  assert.ok(estimate.estimated_recipient_net_cents >= 0);
});

test("payout webhook subscription stores delivery audit logs", () => {
  const {
    createPayoutWebhookSubscription,
    createCryptoPayoutIntent,
    approveCryptoPayout,
    listPayoutWebhookDeliveries
  } = modules.payment;
  const { db } = modules.db;

  const demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@rent.local");
  assert.ok(demoUser?.id);

  const human = db.prepare("SELECT id FROM humans ORDER BY created_at ASC LIMIT 1").get();
  assert.ok(human?.id);

  const subscription = createPayoutWebhookSubscription({
    userId: demoUser.id,
    endpointUrl: "https://webhooks.skinbag.rent/payout-events",
    events: ["*"],
    description: "smoke payout events"
  });
  assert.ok(subscription.id);

  const payout = createCryptoPayoutIntent({
    userId: demoUser.id,
    sourceType: "manual",
    humanId: human.id,
    amountCents: 3200,
    chain: "polygon",
    network: "testnet",
    tokenSymbol: "USDC",
    executionMode: "manual"
  });
  assert.equal(payout.status, "pending");

  approveCryptoPayout({
    userId: demoUser.id,
    payoutId: payout.id
  });

  const deliveries = listPayoutWebhookDeliveries({
    userId: demoUser.id,
    subscriptionId: subscription.id,
    payoutId: payout.id,
    limit: 20,
    offset: 0
  });

  assert.ok(deliveries.some((delivery) => delivery.event_type === "payout_created"));
  assert.ok(deliveries.some((delivery) => delivery.event_type === "payout_approved"));
  assert.ok(deliveries.every((delivery) => delivery.delivery_status === "delivered"));
});

test("availability windows can be created and listed", () => {
  const { setHumanAvailabilityWindow, listHumanAvailabilityWindows } = modules.rent;
  const { db } = modules.db;

  const human = db.prepare("SELECT id FROM humans ORDER BY created_at ASC LIMIT 1").get();
  assert.ok(human?.id);

  const created = setHumanAvailabilityWindow({
    humanId: human.id,
    dayOfWeek: "sat",
    startTime: "10:00",
    endTime: "14:00",
    timezone: "UTC",
    isActive: true
  });
  assert.equal(created.day_of_week, "sat");
  assert.equal(created.start_minute, 600);
  assert.equal(created.end_minute, 840);

  const windows = listHumanAvailabilityWindows({ humanId: human.id });
  assert.ok(windows.some((window) => window.day_of_week === "sat" && window.start_minute === 600));
});

test("bounty matching returns ranked candidates", () => {
  const { matchHumansForBounty } = modules.rent;
  const { db } = modules.db;

  const demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@rent.local");
  assert.ok(demoUser?.id);

  const bounty = db
    .prepare("SELECT id FROM bounties WHERE user_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(demoUser.id);
  assert.ok(bounty?.id);

  const result = matchHumansForBounty({
    userId: demoUser.id,
    bountyId: bounty.id,
    limit: 5,
    includeUnavailable: true
  });

  assert.ok(Array.isArray(result.candidates));
  assert.ok(result.candidates.length > 0);
  assert.ok(typeof result.candidates[0].score === "number");
  assert.ok("skill_match" in result.candidates[0]);
});

test("bounty apply prevents impersonation of another human profile", () => {
  const { applyToBounty } = modules.rent;
  const { db } = modules.db;

  const demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@rent.local");
  assert.ok(demoUser?.id);

  const ownerUser = db.prepare("SELECT id FROM users WHERE email = ?").get("owner@rent.local");
  assert.ok(ownerUser?.id);

  const bounty = db
    .prepare("SELECT id FROM bounties WHERE user_id = ? ORDER BY created_at ASC LIMIT 1")
    .get(demoUser.id);
  assert.ok(bounty?.id);

  const foreignHumanId = randomUUID();
  const ts = new Date().toISOString();
  db.prepare(
    `INSERT INTO humans (
      id, user_id, display_name, headline, bio, hourly_rate_cents, currency, timezone,
      rating_avg, reviews_count, is_available, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    foreignHumanId,
    ownerUser.id,
    "Impersonation Guard",
    "Test Human",
    "Owned by another user",
    5000,
    "USD",
    "UTC",
    0,
    0,
    1,
    ts,
    ts
  );

  assert.throws(
    () =>
      applyToBounty({
        applicantUserId: demoUser.id,
        bountyId: bounty.id,
        humanId: foreignHumanId,
        coverLetter: "Attempt to apply as someone else",
        proposedAmountCents: 1000
      }),
    /own human profile/
  );
});

test("booking milestones can be created, listed, and completed with payout", () => {
  const { createBooking } = modules.rent;
  const { createBookingMilestone, listBookingMilestones, completeBookingMilestone } = modules.payment;
  const { db } = modules.db;

  const demoUser = db.prepare("SELECT id FROM users WHERE email = ?").get("demo@rent.local");
  assert.ok(demoUser?.id);

  const human = db.prepare("SELECT id FROM humans ORDER BY created_at ASC LIMIT 1").get();
  assert.ok(human?.id);

  const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const booking = createBooking({
    userId: demoUser.id,
    humanId: human.id,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    note: "milestone smoke booking"
  });

  const milestone = createBookingMilestone({
    userId: demoUser.id,
    sourceType: "booking",
    sourceId: booking.id,
    title: "Phase 1",
    description: "Initial deliverable",
    amountCents: 1000
  });
  assert.equal(milestone.source_type, "booking");
  assert.equal(milestone.status, "planned");

  const list = listBookingMilestones({
    userId: demoUser.id,
    sourceType: "booking",
    sourceId: booking.id
  });
  assert.ok(list.some((item) => item.id === milestone.id));

  const completed = completeBookingMilestone({
    userId: demoUser.id,
    milestoneId: milestone.id,
    autoCreatePayout: true,
    payout: {
      chain: "polygon",
      network: "testnet",
      tokenSymbol: "USDC",
      executionMode: "manual"
    }
  });
  assert.equal(completed.milestone.status, "completed");
  assert.ok(completed.payout?.id);
});

test("email verification flow requires token and marks user verified by link token", () => {
  const { createLocalUser } = modules.auth;
  const { resendEmailVerification, verifyEmail, verifyEmailByToken } = modules.profile;
  const { db } = modules.db;

  const email = `smoke-${Date.now()}@example.com`;
  const user = createLocalUser({
    email,
    password: "password123",
    fullName: "Smoke Verify"
  });

  const resend = resendEmailVerification(user.id);
  assert.equal(resend.sent, true);
  assert.equal("debugToken" in resend, false);

  const withoutToken = verifyEmail(user.id);
  assert.equal(withoutToken.verified, false);

  const tokenRow = db
    .prepare(
      `SELECT token
       FROM user_email_verification_tokens
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(user.id);

  assert.ok(tokenRow?.token);
  const byLink = verifyEmailByToken(tokenRow.token);
  assert.equal(byLink.verified, true);
});
