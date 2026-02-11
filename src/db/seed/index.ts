import { randomUUID } from "crypto";
import { hashSync } from "bcryptjs";
import { db } from "../client";
import { config } from "../../config";
import { hashCompatApiKey } from "../../services/compatApiKeyService";

export function runSeeds(now: () => string) {
  seedDatabase(now);
  ensureCryptoDefaults(now);
  ensureCompatApiKeyDefaults(now);
  ensureAvailabilityWindowDefaults(now);
}

function seedDatabase(now: () => string) {
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (userCount.count > 0) {
    return;
  }

  const ts = now();
  const tx = db.transaction(() => {
    const demoUserId = randomUUID();
    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, full_name, role, avatar_url, auth_provider, google_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      demoUserId,
      config.MCP_DEFAULT_USER_EMAIL,
      hashSync("demo1234", 10),
      "Demo Client",
      "client",
      null,
      "local",
      null,
      ts,
      ts
    );

    const secondUserId = randomUUID();
    db.prepare(
      `INSERT INTO users (
        id, email, password_hash, full_name, role, avatar_url, auth_provider, google_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      secondUserId,
      "owner@rent.local",
      hashSync("owner1234", 10),
      "Product Owner",
      "admin",
      null,
      "local",
      null,
      ts,
      ts
    );

    const skills = [
      {
        slug: "react",
        name: "React",
        category: "frontend",
        description: "React, TypeScript, component architecture"
      },
      {
        slug: "nodejs",
        name: "Node.js",
        category: "backend",
        description: "REST APIs, WebSockets, service integration"
      },
      {
        slug: "uiux",
        name: "UI/UX",
        category: "design",
        description: "Product design, prototyping, Figma"
      },
      {
        slug: "qa",
        name: "QA Automation",
        category: "quality",
        description: "E2E tests, Cypress, Playwright"
      },
      {
        slug: "growth",
        name: "Growth Marketing",
        category: "marketing",
        description: "Acquisition, funnels, experimentation"
      }
    ];

    const skillIdBySlug = new Map<string, string>();
    const insertSkill = db.prepare(
      "INSERT INTO skills (id, slug, name, category, description) VALUES (?, ?, ?, ?, ?)"
    );

    for (const skill of skills) {
      const id = randomUUID();
      skillIdBySlug.set(skill.slug, id);
      insertSkill.run(id, skill.slug, skill.name, skill.category, skill.description);
    }

    const humans = [
      {
        display_name: "Alex Rivera",
        headline: "Senior Fullstack Engineer",
        bio: "10+ years building SaaS products with React and Node.js.",
        hourly_rate_cents: 12000,
        currency: "USD",
        timezone: "America/New_York",
        rating_avg: 4.9,
        reviews_count: 34,
        is_available: 1,
        skills: ["react", "nodejs"]
      },
      {
        display_name: "Nina Patel",
        headline: "Product Designer",
        bio: "Design systems, user flows, and rapid prototyping for startups.",
        hourly_rate_cents: 9500,
        currency: "USD",
        timezone: "America/Los_Angeles",
        rating_avg: 4.8,
        reviews_count: 27,
        is_available: 1,
        skills: ["uiux", "react"]
      },
      {
        display_name: "Marcus Lee",
        headline: "QA and Release Specialist",
        bio: "Turns flaky release pipelines into repeatable deployments.",
        hourly_rate_cents: 7800,
        currency: "USD",
        timezone: "America/Chicago",
        rating_avg: 4.7,
        reviews_count: 19,
        is_available: 0,
        skills: ["qa", "nodejs"]
      }
    ];

    const insertHuman = db.prepare(
      `INSERT INTO humans (
        id, user_id, display_name, headline, bio, hourly_rate_cents, currency,
        timezone, rating_avg, reviews_count, is_available, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertHumanSkill = db.prepare(
      "INSERT INTO human_skills (human_id, skill_id, level) VALUES (?, ?, ?)"
    );
    const insertAvailabilityWindow = db.prepare(
      `INSERT INTO human_availability_windows (
        id, human_id, day_of_week, start_minute, end_minute, timezone, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const humanIdByName = new Map<string, string>();
    for (const human of humans) {
      const id = randomUUID();
      humanIdByName.set(human.display_name, id);
      insertHuman.run(
        id,
        null,
        human.display_name,
        human.headline,
        human.bio,
        human.hourly_rate_cents,
        human.currency,
        human.timezone,
        human.rating_avg,
        human.reviews_count,
        human.is_available,
        ts,
        ts
      );

      for (const skillSlug of human.skills) {
        const skillId = skillIdBySlug.get(skillSlug);
        if (!skillId) {
          continue;
        }
        insertHumanSkill.run(id, skillId, 4);
      }

      for (const day of ["mon", "tue", "wed", "thu", "fri"] as const) {
        insertAvailabilityWindow.run(randomUUID(), id, day, 9 * 60, 17 * 60, human.timezone, 1, ts, ts);
      }
    }

    const insertWallet = db.prepare(
      `INSERT INTO human_wallets (
        id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
        verification_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const alexId = humanIdByName.get("Alex Rivera")!;
    const ninaId = humanIdByName.get("Nina Patel")!;
    insertWallet.run(
      randomUUID(),
      alexId,
      "Alex USDC Wallet",
      "polygon",
      "testnet",
      "USDC",
      "0x4E83362442B8d1beC281594cEa3050c8EB01311C",
      null,
      1,
      "verified",
      ts,
      ts
    );
    insertWallet.run(
      randomUUID(),
      ninaId,
      "Nina USDC Wallet",
      "polygon",
      "testnet",
      "USDC",
      "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      null,
      1,
      "verified",
      ts,
      ts
    );

    db.prepare(
      `INSERT INTO payment_policies (
        user_id, autopay_enabled, require_approval, max_single_payout_cents, max_daily_payout_cents,
        allowed_chains_json, allowed_tokens_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(demoUserId, 1, 1, 150000, 500000, JSON.stringify(["polygon", "ethereum"]), JSON.stringify(["USDC"]), ts, ts);

    db.prepare(
      `INSERT INTO payment_policies (
        user_id, autopay_enabled, require_approval, max_single_payout_cents, max_daily_payout_cents,
        allowed_chains_json, allowed_tokens_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(secondUserId, 1, 0, 300000, 1000000, JSON.stringify(["polygon", "ethereum"]), JSON.stringify(["USDC", "USDT"]), ts, ts);

    const insertReview = db.prepare(
      "INSERT INTO reviews (id, human_id, author_name, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );

    insertReview.run(
      randomUUID(),
      humanIdByName.get("Alex Rivera"),
      "SaaS Founder",
      5,
      "Delivered production-ready API and frontend in less than two weeks.",
      ts
    );
    insertReview.run(
      randomUUID(),
      humanIdByName.get("Nina Patel"),
      "Startup CTO",
      5,
      "Great communication and clear user-centered design decisions.",
      ts
    );

    const bountyId = randomUUID();
    db.prepare(
      `INSERT INTO bounties (
        id, user_id, title, description, budget_cents, currency, status, skill_slug, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      bountyId,
      demoUserId,
      "Build landing page with analytics",
      "Need a responsive landing page + event tracking setup.",
      150000,
      "USD",
      "open",
      "react",
      ts,
      ts
    );

    db.prepare(
      `INSERT INTO bounty_applications (
        id, bounty_id, human_id, cover_letter, proposed_amount_cents, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      bountyId,
      alexId,
      "Can deliver in 7 days with clean analytics events and docs.",
      140000,
      "applied",
      ts,
      ts
    );

    const conversationId = randomUUID();
    db.prepare(
      "INSERT INTO conversations (id, user_id, human_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(conversationId, demoUserId, alexId, "Need help with API architecture", "open", ts, ts);

    const insertMessage = db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );

    insertMessage.run(
      randomUUID(),
      conversationId,
      "user",
      demoUserId,
      "Hi Alex, can you review our current Node.js API structure?",
      ts
    );
    insertMessage.run(
      randomUUID(),
      conversationId,
      "human",
      alexId,
      "Sure, share your repo and I will suggest a migration plan.",
      ts
    );

    db.prepare(
      `INSERT INTO api_bookings (
        id, human_id, agent_id, agent_type, task_title, task_description, start_time, estimated_hours,
        total_amount_cents, currency, status, payment_tx_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      alexId,
      "agent_local_demo",
      "openai",
      "Architecture review + migration checklist",
      "Need an external review of API boundaries and data model.",
      ts,
      3,
      36000,
      "USD",
      "pending",
      null,
      ts,
      ts
    );
  });

  tx();
}

function ensureCryptoDefaults(now: () => string) {
  const ts = now();

  const users = db.prepare("SELECT id FROM users").all() as Array<{ id: string }>;
  const upsertPolicy = db.prepare(
    `INSERT INTO payment_policies (
      user_id, autopay_enabled, require_approval, max_single_payout_cents, max_daily_payout_cents,
      allowed_chains_json, allowed_tokens_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO NOTHING`
  );

  for (const user of users) {
    upsertPolicy.run(
      user.id,
      0,
      1,
      100000,
      300000,
      JSON.stringify(["polygon"]),
      JSON.stringify(["USDC"]),
      ts,
      ts
    );
  }

  const walletsCount = db.prepare("SELECT COUNT(*) as count FROM human_wallets").get() as { count: number };
  if (walletsCount.count > 0) {
    return;
  }

  const humans = db
    .prepare("SELECT id, display_name FROM humans WHERE display_name IN (?, ?)")
    .all("Alex Rivera", "Nina Patel") as Array<{ id: string; display_name: string }>;

  const insertWallet = db.prepare(
    `INSERT INTO human_wallets (
      id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
      verification_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const human of humans) {
    const address =
      human.display_name === "Alex Rivera"
        ? "0x4E83362442B8d1beC281594cEa3050c8EB01311C"
        : "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

    insertWallet.run(
      randomUUID(),
      human.id,
      `${human.display_name} USDC Wallet`,
      "polygon",
      "testnet",
      "USDC",
      address,
      null,
      1,
      "verified",
      ts,
      ts
    );
  }
}

function ensureCompatApiKeyDefaults(now: () => string) {
  const countRow = db.prepare("SELECT COUNT(*) as count FROM api_keys").get() as { count: number };
  if (countRow.count > 0) {
    return;
  }

  if (config.NODE_ENV === "production" && !config.COMPAT_DEMO_API_KEY) {
    return;
  }

  const apiKey = config.COMPAT_DEMO_API_KEY || "sbr_demo_local_key";
  const ts = now();

  db.prepare(
    `INSERT INTO api_keys (
      id, name, key_hash, agent_id, agent_type, scopes_json, status, created_by_user_id, last_used_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    "Local demo compat key",
    hashCompatApiKey(apiKey),
    "agent_local_demo",
    "openai",
    JSON.stringify(["compat:read", "compat:write"]),
    "active",
    null,
    null,
    ts,
    ts
  );

  if (config.NODE_ENV !== "production") {
    console.log(`[compat-api] demo key seeded: ${apiKey}`);
  }
}

function ensureAvailabilityWindowDefaults(now: () => string) {
  const ts = now();
  const humans = db.prepare("SELECT id, timezone FROM humans").all() as Array<{ id: string; timezone: string }>;
  const insertWindow = db.prepare(
    `INSERT INTO human_availability_windows (
      id, human_id, day_of_week, start_minute, end_minute, timezone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const human of humans) {
    const row = db
      .prepare("SELECT id FROM human_availability_windows WHERE human_id = ? LIMIT 1")
      .get(human.id) as { id: string } | undefined;
    if (row) {
      continue;
    }

    for (const day of ["mon", "tue", "wed", "thu", "fri"] as const) {
      insertWindow.run(randomUUID(), human.id, day, 9 * 60, 17 * 60, human.timezone || "UTC", 1, ts, ts);
    }
  }
}
