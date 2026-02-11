import { randomUUID } from "crypto";
import { db } from "../db/client";
import { upsertHumanWallet } from "./paymentService";
import type { ApiBookingStatus, HumanWallet } from "../types";

const now = () => new Date().toISOString();

const BOOKING_STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled"] as const;

interface HumanListRow {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  timezone: string;
  hourly_rate_cents: number;
  rating_avg: number;
  reviews_count: number;
  is_available: number;
  skills: string | null;
}

interface ApiBookingRow {
  id: string;
  human_id: string;
  agent_id: string;
  agent_type: string | null;
  task_title: string;
  task_description: string | null;
  start_time: string;
  estimated_hours: number;
  total_amount_cents: number;
  currency: string;
  status: ApiBookingStatus;
  payment_tx_hash: string | null;
  created_at: string;
  updated_at: string;
  human_name: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function ensureHuman(humanId: string) {
  const row = db.prepare("SELECT id FROM humans WHERE id = ?").get(humanId) as { id: string } | undefined;
  if (!row) {
    throw new Error("Human not found");
  }
}

function getHumanWallets(humanId: string): HumanWallet[] {
  return db
    .prepare(
      `SELECT id, human_id, label, chain, network, token_symbol, address, destination_tag, is_default,
              verification_status, created_at, updated_at
       FROM human_wallets
       WHERE human_id = ?
       ORDER BY is_default DESC, updated_at DESC`
    )
    .all(humanId) as HumanWallet[];
}

function mapHumanRow(row: HumanListRow, includeWallets = false) {
  const base = {
    id: row.id,
    name: row.display_name,
    headline: row.headline,
    bio: row.bio,
    timezone: row.timezone,
    hourlyRate: Number((row.hourly_rate_cents / 100).toFixed(2)),
    hourlyRateCents: row.hourly_rate_cents,
    skills: row.skills ? row.skills.split(",") : [],
    rating: row.rating_avg,
    reviewCount: row.reviews_count,
    isAvailable: Boolean(row.is_available)
  };

  if (!includeWallets) {
    return base;
  }

  const wallets = getHumanWallets(row.id).map((wallet) => ({
    id: wallet.id,
    chain: wallet.chain,
    network: wallet.network,
    tokenSymbol: wallet.token_symbol,
    address: wallet.address,
    destinationTag: wallet.destination_tag,
    isDefault: Boolean(wallet.is_default),
    verificationStatus: wallet.verification_status
  }));

  return {
    ...base,
    cryptoWallets: wallets,
    availability: {
      isAvailable: Boolean(row.is_available),
      timezone: row.timezone
    }
  };
}

export function listApiHumans(input: {
  skill?: string;
  minRate?: number;
  maxRate?: number;
  name?: string;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (input.name) {
    where.push("lower(h.display_name) LIKE ?");
    params.push(`%${input.name.toLowerCase()}%`);
  }

  if (typeof input.minRate === "number") {
    where.push("h.hourly_rate_cents >= ?");
    params.push(Math.round(input.minRate * 100));
  }

  if (typeof input.maxRate === "number") {
    where.push("h.hourly_rate_cents <= ?");
    params.push(Math.round(input.maxRate * 100));
  }

  if (input.skill) {
    const normalized = input.skill.trim().toLowerCase();
    const normalizedSlug = slugify(normalized);
    where.push(
      `EXISTS (
        SELECT 1
        FROM human_skills hs2
        JOIN skills s2 ON s2.id = hs2.skill_id
        WHERE hs2.human_id = h.id
          AND (
            lower(s2.slug) = ?
            OR lower(s2.name) = ?
            OR lower(s2.name) LIKE ?
          )
      )`
    );
    params.push(normalizedSlug, normalized, `%${normalized}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT
          h.id,
          h.display_name,
          h.headline,
          h.bio,
          h.timezone,
          h.hourly_rate_cents,
          h.rating_avg,
          h.reviews_count,
          h.is_available,
          GROUP_CONCAT(s.slug) AS skills
       FROM humans h
       LEFT JOIN human_skills hs ON hs.human_id = h.id
       LEFT JOIN skills s ON s.id = hs.skill_id
       ${whereClause}
       GROUP BY h.id
       ORDER BY h.rating_avg DESC, h.reviews_count DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as HumanListRow[];

  return rows.map((row) => mapHumanRow(row));
}

export function getApiHuman(humanId: string) {
  const row = db
    .prepare(
      `SELECT
          h.id,
          h.display_name,
          h.headline,
          h.bio,
          h.timezone,
          h.hourly_rate_cents,
          h.rating_avg,
          h.reviews_count,
          h.is_available,
          GROUP_CONCAT(s.slug) AS skills
       FROM humans h
       LEFT JOIN human_skills hs ON hs.human_id = h.id
       LEFT JOIN skills s ON s.id = hs.skill_id
       WHERE h.id = ?
       GROUP BY h.id`
    )
    .get(humanId) as HumanListRow | undefined;

  if (!row) {
    return null;
  }

  return mapHumanRow(row, true);
}

function ensureOrCreateUserByEmail(input: { email: string; fullName: string }) {
  const normalizedEmail = input.email.toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail) as
    | { id: string }
    | undefined;

  if (existing) {
    return existing.id;
  }

  const userId = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO users (
      id, email, password_hash, full_name, avatar_url, auth_provider, google_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, normalizedEmail, null, input.fullName, null, "local", null, ts, ts);

  return userId;
}

function ensureSkill(skillName: string): { id: string; slug: string } {
  const normalized = skillName.trim();
  const slug = slugify(normalized);

  const existingBySlug = db.prepare("SELECT id, slug FROM skills WHERE slug = ?").get(slug) as
    | { id: string; slug: string }
    | undefined;

  if (existingBySlug) {
    return existingBySlug;
  }

  const existingByName = db
    .prepare("SELECT id, slug FROM skills WHERE lower(name) = ?")
    .get(normalized.toLowerCase()) as { id: string; slug: string } | undefined;

  if (existingByName) {
    return existingByName;
  }

  const id = randomUUID();
  db.prepare("INSERT INTO skills (id, slug, name, category, description) VALUES (?, ?, ?, ?, ?)").run(
    id,
    slug,
    normalized,
    "custom",
    `${normalized} skill`
  );

  return { id, slug };
}

export function createApiHuman(input: {
  name: string;
  email: string;
  skills: string[];
  cryptoWallets: Array<{
    chain: string;
    network?: string;
    tokenSymbol?: string;
    address: string;
    label?: string;
    destinationTag?: string | null;
  }>;
  headline?: string;
  bio?: string;
  hourlyRate?: number;
  timezone?: string;
}) {
  const cleanedSkills = [...new Set(input.skills.map((skill) => skill.trim()).filter(Boolean))];
  if (!cleanedSkills.length) {
    throw new Error("skills must include at least one value");
  }

  if (!input.cryptoWallets.length) {
    throw new Error("cryptoWallets must include at least one wallet");
  }

  const userId = ensureOrCreateUserByEmail({ email: input.email, fullName: input.name });
  const humanId = randomUUID();
  const ts = now();
  const hourlyRateCents = Math.max(Math.round((input.hourlyRate ?? 95) * 100), 100);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO humans (
        id, user_id, display_name, headline, bio, hourly_rate_cents, currency, timezone,
        rating_avg, reviews_count, is_available, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      humanId,
      userId,
      input.name,
      input.headline ?? "Independent specialist",
      input.bio ?? `${input.name} profile created via RentAHuman-style API.`,
      hourlyRateCents,
      "USD",
      input.timezone ?? "UTC",
      0,
      0,
      1,
      ts,
      ts
    );

    for (const skillName of cleanedSkills) {
      const skill = ensureSkill(skillName);
      db.prepare(
        "INSERT INTO human_skills (human_id, skill_id, level) VALUES (?, ?, ?) ON CONFLICT (human_id, skill_id) DO NOTHING"
      ).run(
        humanId,
        skill.id,
        3
      );
    }

    input.cryptoWallets.forEach((wallet, index) => {
      upsertHumanWallet({
        humanId,
        label: wallet.label ?? `${input.name} ${wallet.tokenSymbol ?? "USDC"}`,
        chain: wallet.chain,
        network: wallet.network ?? "mainnet",
        tokenSymbol: wallet.tokenSymbol ?? "USDC",
        address: wallet.address,
        destinationTag: wallet.destinationTag ?? null,
        isDefault: index === 0,
        verificationStatus: "unverified"
      });
    });
  });

  tx();

  return getApiHuman(humanId);
}

function mapApiBookingRow(row: ApiBookingRow) {
  const paymentWallet = db
    .prepare(
      `SELECT chain, network, token_symbol, address
       FROM human_wallets
       WHERE human_id = ?
       ORDER BY is_default DESC, updated_at DESC
       LIMIT 1`
    )
    .get(row.human_id) as { chain: string; network: string; token_symbol: string; address: string } | undefined;

  return {
    id: row.id,
    humanId: row.human_id,
    humanName: row.human_name,
    agentId: row.agent_id,
    agentType: row.agent_type,
    taskTitle: row.task_title,
    taskDescription: row.task_description,
    startTime: row.start_time,
    estimatedHours: row.estimated_hours,
    totalAmount: Number((row.total_amount_cents / 100).toFixed(2)),
    totalAmountCents: row.total_amount_cents,
    currency: row.currency,
    status: row.status,
    paymentTxHash: row.payment_tx_hash,
    paymentWallet: paymentWallet
      ? {
          chain: paymentWallet.chain,
          network: paymentWallet.network,
          tokenSymbol: paymentWallet.token_symbol,
          address: paymentWallet.address
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listApiBookings(input: {
  humanId?: string;
  agentId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (input.humanId) {
    where.push("b.human_id = ?");
    params.push(input.humanId);
  }

  if (input.agentId) {
    where.push("b.agent_id = ?");
    params.push(input.agentId);
  }

  if (input.status) {
    const normalizedStatus = input.status.trim().toLowerCase();
    if (!BOOKING_STATUSES.includes(normalizedStatus as ApiBookingStatus)) {
      throw new Error(`Unsupported booking status: ${input.status}`);
    }
    where.push("b.status = ?");
    params.push(normalizedStatus);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT
         b.id,
         b.human_id,
         b.agent_id,
         b.agent_type,
         b.task_title,
         b.task_description,
         b.start_time,
         b.estimated_hours,
         b.total_amount_cents,
         b.currency,
         b.status,
         b.payment_tx_hash,
         b.created_at,
         b.updated_at,
         h.display_name AS human_name
       FROM api_bookings b
       JOIN humans h ON h.id = b.human_id
       ${whereClause}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as ApiBookingRow[];

  return rows.map(mapApiBookingRow);
}

export function getApiBooking(bookingId: string) {
  const row = db
    .prepare(
      `SELECT
         b.id,
         b.human_id,
         b.agent_id,
         b.agent_type,
         b.task_title,
         b.task_description,
         b.start_time,
         b.estimated_hours,
         b.total_amount_cents,
         b.currency,
         b.status,
         b.payment_tx_hash,
         b.created_at,
         b.updated_at,
         h.display_name AS human_name
       FROM api_bookings b
       JOIN humans h ON h.id = b.human_id
       WHERE b.id = ?`
    )
    .get(bookingId) as ApiBookingRow | undefined;

  if (!row) {
    return null;
  }

  return mapApiBookingRow(row);
}

export function createApiBooking(input: {
  humanId: string;
  agentId: string;
  agentType?: string;
  taskTitle: string;
  taskDescription?: string;
  startTime: string;
  estimatedHours: number;
}) {
  ensureHuman(input.humanId);

  const start = new Date(input.startTime);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Invalid startTime");
  }

  if (input.estimatedHours <= 0) {
    throw new Error("estimatedHours must be positive");
  }

  const rateRow = db.prepare("SELECT hourly_rate_cents FROM humans WHERE id = ?").get(input.humanId) as
    | { hourly_rate_cents: number }
    | undefined;

  if (!rateRow) {
    throw new Error("Human not found");
  }

  const totalAmountCents = Math.round(rateRow.hourly_rate_cents * input.estimatedHours);
  const bookingId = `booking_${randomUUID().replace(/-/g, "").slice(0, 18)}`;
  const ts = now();

  db.prepare(
    `INSERT INTO api_bookings (
      id, human_id, agent_id, agent_type, task_title, task_description, start_time, estimated_hours,
      total_amount_cents, currency, status, payment_tx_hash, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bookingId,
    input.humanId,
    input.agentId,
    input.agentType ?? null,
    input.taskTitle,
    input.taskDescription ?? null,
    start.toISOString(),
    input.estimatedHours,
    totalAmountCents,
    "USD",
    "pending",
    null,
    ts,
    ts
  );

  return getApiBooking(bookingId);
}

export function updateApiBooking(input: {
  bookingId: string;
  status?: string;
  paymentTxHash?: string | null;
}) {
  const existing = getApiBooking(input.bookingId);
  if (!existing) {
    throw new Error("Booking not found");
  }

  const patch: string[] = [];
  const values: Array<string | number | null> = [];

  if (input.status) {
    const normalizedStatus = input.status.trim().toLowerCase();
    if (!BOOKING_STATUSES.includes(normalizedStatus as ApiBookingStatus)) {
      throw new Error(`Unsupported booking status: ${input.status}`);
    }
    patch.push("status = ?");
    values.push(normalizedStatus);
  }

  if (input.paymentTxHash !== undefined) {
    patch.push("payment_tx_hash = ?");
    values.push(input.paymentTxHash);
  }

  if (!patch.length) {
    return existing;
  }

  patch.push("updated_at = ?");
  values.push(now());

  db.prepare(`UPDATE api_bookings SET ${patch.join(", ")} WHERE id = ?`).run(...values, input.bookingId);

  return getApiBooking(input.bookingId);
}
