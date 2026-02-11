import { randomUUID } from "crypto";
import { db } from "../db/client";
import { config } from "../config";
import { listHumanWallets } from "./paymentService";

const now = () => new Date().toISOString();
const RESEND_COOLDOWN_SECONDS = 60;

type SocialLinks = {
  twitter?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  instagram?: string;
  youtube?: string;
};

interface UserProfileRow {
  id: string;
  email: string;
  full_name: string;
  email_verified: number;
  email_verified_at: string | null;
}

interface HumanProfileRow {
  id: string;
  user_id: string | null;
  display_name: string;
  headline: string;
  bio: string;
  hourly_rate_cents: number;
  timezone: string;
  is_available: number;
}

interface HumanSettingsRow {
  human_id: string;
  city: string | null;
  state: string | null;
  country: string | null;
  show_email: number;
  social_links_json: string;
}

interface CompletionStep {
  key: "name" | "skill" | "wallet";
  label: string;
  done: boolean;
}

interface OnboardingNotification {
  key: "verify_email" | "complete_profile";
  title: string;
  body: string;
  actions?: Array<{
    key: "verify_now" | "resend";
    label: string;
    endpoint: string;
    method: "POST";
    enabled: boolean;
    retryAfterSeconds?: number;
  }>;
  checklist?: CompletionStep[];
}

function parseSocialLinks(raw: string | null | undefined): SocialLinks {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const obj = parsed as Record<string, unknown>;
    return {
      twitter: typeof obj.twitter === "string" ? obj.twitter : undefined,
      linkedin: typeof obj.linkedin === "string" ? obj.linkedin : undefined,
      github: typeof obj.github === "string" ? obj.github : undefined,
      website: typeof obj.website === "string" ? obj.website : undefined,
      instagram: typeof obj.instagram === "string" ? obj.instagram : undefined,
      youtube: typeof obj.youtube === "string" ? obj.youtube : undefined
    };
  } catch {
    return {};
  }
}

function toSafeSocialLinks(input?: SocialLinks): SocialLinks {
  if (!input) {
    return {};
  }

  const clean = (value?: string) => {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  return {
    twitter: clean(input.twitter),
    linkedin: clean(input.linkedin),
    github: clean(input.github),
    website: clean(input.website),
    instagram: clean(input.instagram),
    youtube: clean(input.youtube)
  };
}

function getUser(userId: string): UserProfileRow {
  const row = db
    .prepare("SELECT id, email, full_name, email_verified, email_verified_at FROM users WHERE id = ?")
    .get(userId) as UserProfileRow | undefined;

  if (!row) {
    throw new Error("User not found");
  }
  return row;
}

function getHumanByUser(userId: string): HumanProfileRow | null {
  const row = db
    .prepare(
      `SELECT id, user_id, display_name, headline, bio, hourly_rate_cents, timezone, is_available
       FROM humans
       WHERE user_id = ?
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(userId) as HumanProfileRow | undefined;

  return row ?? null;
}

function createHumanForUser(userId: string): HumanProfileRow {
  const user = getUser(userId);
  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO humans (
      id, user_id, display_name, headline, bio, hourly_rate_cents, currency, timezone,
      rating_avg, reviews_count, is_available, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    user.id,
    user.full_name,
    "",
    "",
    5000,
    "USD",
    "UTC",
    0,
    0,
    1,
    ts,
    ts
  );

  db.prepare(
    `UPDATE users
     SET role = CASE WHEN role = 'client' THEN 'human' ELSE role END, updated_at = ?
     WHERE id = ?`
  ).run(ts, userId);

  return getHumanByUser(userId)!;
}

function getOrCreateHuman(userId: string): HumanProfileRow {
  return getHumanByUser(userId) ?? createHumanForUser(userId);
}

function getHumanSettings(humanId: string): HumanSettingsRow {
  const existing = db
    .prepare(
      `SELECT human_id, city, state, country, show_email, social_links_json
       FROM human_profile_settings
       WHERE human_id = ?`
    )
    .get(humanId) as HumanSettingsRow | undefined;

  if (existing) {
    return existing;
  }

  const ts = now();
  db.prepare(
    `INSERT INTO human_profile_settings (
      human_id, city, state, country, show_email, social_links_json, photos_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(humanId, null, null, null, 0, JSON.stringify({}), JSON.stringify([]), ts, ts);

  return db
    .prepare(
      `SELECT human_id, city, state, country, show_email, social_links_json
       FROM human_profile_settings
       WHERE human_id = ?`
    )
    .get(humanId) as HumanSettingsRow;
}

function getHumanSkills(humanId: string): Array<{ id: string; slug: string; name: string }> {
  return db
    .prepare(
      `SELECT s.id, s.slug, s.name
       FROM human_skills hs
       JOIN skills s ON s.id = hs.skill_id
       WHERE hs.human_id = ?
       ORDER BY s.name ASC`
    )
    .all(humanId) as Array<{ id: string; slug: string; name: string }>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function ensureSkillByName(name: string): { id: string; slug: string; name: string } {
  const normalizedName = name.trim();
  const slug = slugify(normalizedName);

  const bySlug = db
    .prepare("SELECT id, slug, name FROM skills WHERE slug = ?")
    .get(slug) as { id: string; slug: string; name: string } | undefined;

  if (bySlug) {
    return bySlug;
  }

  const id = randomUUID();
  db.prepare("INSERT INTO skills (id, slug, name, category, description) VALUES (?, ?, ?, ?, ?)").run(
    id,
    slug,
    normalizedName,
    "custom",
    `${normalizedName} skill`
  );

  return { id, slug, name: normalizedName };
}

function buildCompletion(input: { hasName: boolean; hasSkill: boolean; hasWallet: boolean }) {
  const steps: CompletionStep[] = [
    { key: "name", label: "Add your name", done: input.hasName },
    { key: "skill", label: "Add at least one skill", done: input.hasSkill },
    { key: "wallet", label: "Add a payment wallet", done: input.hasWallet }
  ];

  return {
    completed: steps.filter((step) => step.done).length,
    total: steps.length,
    steps
  };
}

function getLastVerificationTokenMetadata(userId: string) {
  const row = db
    .prepare(
      `SELECT created_at
       FROM user_email_verification_tokens
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(userId) as { created_at: string } | undefined;

  if (!row) {
    return {
      lastSentAt: null,
      resendAvailable: true,
      retryAfterSeconds: 0
    };
  }

  const sentAt = new Date(row.created_at);
  const elapsedSeconds = Math.floor((Date.now() - sentAt.getTime()) / 1000);
  const retryAfterSeconds = Math.max(RESEND_COOLDOWN_SECONDS - elapsedSeconds, 0);

  return {
    lastSentAt: row.created_at,
    resendAvailable: retryAfterSeconds === 0,
    retryAfterSeconds
  };
}

function buildOnboardingNotifications(input: {
  emailVerified: boolean;
  completion: { completed: number; total: number; steps: CompletionStep[] };
  resendAvailable: boolean;
  retryAfterSeconds: number;
}): OnboardingNotification[] {
  const notifications: OnboardingNotification[] = [];

  if (!input.emailVerified) {
    notifications.push({
      key: "verify_email",
      title: "verify your email",
      body: "check your inbox for a verification link",
      actions: [
        {
          key: "verify_now",
          label: "i've verified",
          endpoint: "/api/profile/email/verify",
          method: "POST",
          enabled: true
        },
        {
          key: "resend",
          label: "resend",
          endpoint: "/api/profile/email/resend",
          method: "POST",
          enabled: input.resendAvailable,
          retryAfterSeconds: input.retryAfterSeconds
        }
      ]
    });
  }

  if (input.completion.completed < input.completion.total) {
    notifications.push({
      key: "complete_profile",
      title: "complete your profile",
      body: "finish these steps to start receiving bookings:",
      checklist: input.completion.steps
    });
  }

  return notifications;
}

export function getProfileForUser(userId: string) {
  const user = getUser(userId);
  const human = getOrCreateHuman(userId);
  const settings = getHumanSettings(human.id);
  const skills = getHumanSkills(human.id);
  const wallets = listHumanWallets(human.id);

  const hasName = Boolean(human.display_name.trim());
  const hasSkill = skills.length > 0;
  const hasWallet = wallets.length > 0;
  const completion = buildCompletion({ hasName, hasSkill, hasWallet });
  const verificationMetadata = getLastVerificationTokenMetadata(user.id);
  const notifications = buildOnboardingNotifications({
    emailVerified: Boolean(user.email_verified),
    completion,
    resendAvailable: verificationMetadata.resendAvailable,
    retryAfterSeconds: verificationMetadata.retryAfterSeconds
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.email_verified),
      emailVerifiedAt: user.email_verified_at
    },
    profile: {
      humanId: human.id,
      name: human.display_name,
      headline: human.headline,
      bio: human.bio,
      city: settings.city,
      state: settings.state,
      country: settings.country,
      available: Boolean(human.is_available),
      showEmail: Boolean(settings.show_email),
      rate: Number((human.hourly_rate_cents / 100).toFixed(2)),
      timezone: human.timezone,
      skills,
      socialLinks: parseSocialLinks(settings.social_links_json),
      wallets: wallets.map((wallet) => ({
        id: wallet.id,
        chain: wallet.chain,
        network: wallet.network,
        tokenSymbol: wallet.token_symbol,
        address: wallet.address,
        isDefault: Boolean(wallet.is_default),
        verificationStatus: wallet.verification_status
      }))
    },
    completion,
    notifications,
    verification: {
      lastSentAt: verificationMetadata.lastSentAt,
      resendAvailable: verificationMetadata.resendAvailable,
      retryAfterSeconds: verificationMetadata.retryAfterSeconds
    }
  };
}

export function updateProfileForUser(
  userId: string,
  input: {
    name?: string;
    headline?: string;
    bio?: string;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    available?: boolean;
    showEmail?: boolean;
    rate?: number;
    timezone?: string;
    socialLinks?: SocialLinks;
  }
) {
  const human = getOrCreateHuman(userId);
  const settings = getHumanSettings(human.id);

  const humanPatch: string[] = [];
  const humanValues: Array<string | number | null> = [];

  if (typeof input.name === "string") {
    humanPatch.push("display_name = ?");
    humanValues.push(input.name.trim());
  }
  if (typeof input.headline === "string") {
    humanPatch.push("headline = ?");
    humanValues.push(input.headline.trim());
  }
  if (typeof input.bio === "string") {
    humanPatch.push("bio = ?");
    humanValues.push(input.bio.trim());
  }
  if (typeof input.available === "boolean") {
    humanPatch.push("is_available = ?");
    humanValues.push(input.available ? 1 : 0);
  }
  if (typeof input.rate === "number") {
    const cents = Math.max(Math.round(input.rate * 100), 100);
    humanPatch.push("hourly_rate_cents = ?");
    humanValues.push(cents);
  }
  if (typeof input.timezone === "string") {
    humanPatch.push("timezone = ?");
    humanValues.push(input.timezone.trim() || "UTC");
  }

  if (humanPatch.length) {
    humanPatch.push("updated_at = ?");
    humanValues.push(now());
    db.prepare(`UPDATE humans SET ${humanPatch.join(", ")} WHERE id = ?`).run(...humanValues, human.id);
  }

  const settingsPatch: string[] = [];
  const settingsValues: Array<string | number | null> = [];

  if (input.city !== undefined) {
    settingsPatch.push("city = ?");
    settingsValues.push(input.city?.trim() || null);
  }
  if (input.state !== undefined) {
    settingsPatch.push("state = ?");
    settingsValues.push(input.state?.trim() || null);
  }
  if (input.country !== undefined) {
    settingsPatch.push("country = ?");
    settingsValues.push(input.country?.trim() || null);
  }
  if (typeof input.showEmail === "boolean") {
    settingsPatch.push("show_email = ?");
    settingsValues.push(input.showEmail ? 1 : 0);
  }
  if (input.socialLinks !== undefined) {
    settingsPatch.push("social_links_json = ?");
    settingsValues.push(JSON.stringify(toSafeSocialLinks(input.socialLinks)));
  }

  if (settingsPatch.length) {
    settingsPatch.push("updated_at = ?");
    settingsValues.push(now());
    db.prepare(`UPDATE human_profile_settings SET ${settingsPatch.join(", ")} WHERE human_id = ?`).run(
      ...settingsValues,
      settings.human_id
    );
  }

  return getProfileForUser(userId);
}

export function addSkillToProfile(userId: string, skillName: string) {
  const human = getOrCreateHuman(userId);
  const skill = ensureSkillByName(skillName);

  db.prepare(
    "INSERT INTO human_skills (human_id, skill_id, level) VALUES (?, ?, ?) ON CONFLICT (human_id, skill_id) DO NOTHING"
  ).run(
    human.id,
    skill.id,
    3
  );

  return getProfileForUser(userId);
}

export function removeSkillFromProfile(userId: string, skillSlug: string) {
  const human = getOrCreateHuman(userId);

  const skill = db.prepare("SELECT id FROM skills WHERE slug = ?").get(skillSlug) as { id: string } | undefined;
  if (!skill) {
    return getProfileForUser(userId);
  }

  db.prepare("DELETE FROM human_skills WHERE human_id = ? AND skill_id = ?").run(human.id, skill.id);
  return getProfileForUser(userId);
}

export function resendEmailVerification(userId: string) {
  const user = getUser(userId);
  if (user.email_verified) {
    return {
      alreadyVerified: true,
      message: "Email already verified"
    };
  }

  const metadata = getLastVerificationTokenMetadata(userId);
  if (!metadata.resendAvailable) {
    return {
      sent: false,
      message: `Please wait ${metadata.retryAfterSeconds}s before requesting another email`,
      retryAfterSeconds: metadata.retryAfterSeconds
    };
  }

  const token = randomUUID().replace(/-/g, "");
  const createdAt = now();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO user_email_verification_tokens (
      id, user_id, token, expires_at, consumed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(randomUUID(), userId, token, expiresAt, null, createdAt);

  if (config.NODE_ENV !== "production") {
    const verifyUrl = `${config.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    console.log(`[email] verify ${user.email} via: ${verifyUrl}`);
  }

  return {
    sent: true,
    message: "Verification link sent",
    retryAfterSeconds: RESEND_COOLDOWN_SECONDS
  };
}

function consumeEmailVerificationToken(input: { token: string; userId?: string }) {
  const row = db
    .prepare(
      `SELECT id, user_id, token, expires_at, consumed_at
       FROM user_email_verification_tokens
       WHERE token = ?
       LIMIT 1`
    )
    .get(input.token) as
    | { id: string; user_id: string; token: string; expires_at: string; consumed_at: string | null }
    | undefined;

  if (!row) {
    throw new Error("Verification token not found");
  }
  if (input.userId && row.user_id !== input.userId) {
    throw new Error("Verification token does not match current user");
  }
  if (row.consumed_at) {
    throw new Error("Verification token already used");
  }

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw new Error("Verification token expired");
  }

  const ts = now();
  const tx = db.transaction(() => {
    db.prepare("UPDATE user_email_verification_tokens SET consumed_at = ? WHERE id = ?").run(ts, row.id);
    db.prepare(
      "UPDATE user_email_verification_tokens SET consumed_at = COALESCE(consumed_at, ?) WHERE user_id = ?"
    ).run(ts, row.user_id);
    db.prepare("UPDATE users SET email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?").run(
      ts,
      ts,
      row.user_id
    );
  });

  tx();
  return { userId: row.user_id, verifiedAt: ts };
}

export function verifyEmail(userId: string, token?: string) {
  const user = getUser(userId);
  if (user.email_verified) {
    return {
      verified: true,
      alreadyVerified: true
    };
  }

  if (!token) {
    return {
      verified: false,
      message: "Open the verification link from your email, then click 'i've verified'."
    };
  }

  const consumed = consumeEmailVerificationToken({ token, userId });
  return {
    verified: true,
    verifiedAt: consumed.verifiedAt
  };
}

export function verifyEmailByToken(token: string) {
  const consumed = consumeEmailVerificationToken({ token });
  return {
    verified: true,
    userId: consumed.userId,
    verifiedAt: consumed.verifiedAt
  };
}
