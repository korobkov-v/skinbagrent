import { randomUUID } from "crypto";
import { db } from "../db/client";
import { config } from "../config";
import type {
  ApplicationStatus,
  BountyMatchCandidate,
  Booking,
  BookingStatus,
  Bounty,
  BountyApplication,
  BountyStatus,
  Conversation,
  ConversationStatus,
  HumanAvailabilityWindow,
  HumanSummary,
  Message,
  Review,
  Skill,
  Weekday
} from "../types";

type SqlParams = Array<string | number | null>;

const now = () => new Date().toISOString();
const WEEKDAY_VALUES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface HumanRow {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  hourly_rate_cents: number;
  currency: string;
  timezone: string;
  rating_avg: number;
  reviews_count: number;
  is_available: number;
  skills: string | null;
}

function mapHuman(row: HumanRow): HumanSummary {
  return {
    id: row.id,
    display_name: row.display_name,
    headline: row.headline,
    bio: row.bio,
    hourly_rate_cents: row.hourly_rate_cents,
    currency: row.currency,
    timezone: row.timezone,
    rating_avg: row.rating_avg,
    reviews_count: row.reviews_count,
    is_available: row.is_available,
    skills: row.skills ? row.skills.split(",") : []
  };
}

function getHumanOwner(humanId: string): { id: string; user_id: string | null; timezone: string } | null {
  const row = db.prepare("SELECT id, user_id, timezone FROM humans WHERE id = ?").get(humanId) as
    | { id: string; user_id: string | null; timezone: string }
    | undefined;
  return row ?? null;
}

function parseTimeToMinute(value: string): number {
  const parsed = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!parsed) {
    throw new Error("Time must be in HH:MM 24h format");
  }
  const hours = Number(parsed[1]);
  const minutes = Number(parsed[2]);
  return hours * 60 + minutes;
}

function getWeekdayInTimezone(timezone: string, date = new Date()): Weekday {
  const raw = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date).toLowerCase();
  const normalized = raw.slice(0, 3) as Weekday;
  if (!WEEKDAY_VALUES.includes(normalized)) {
    return "mon";
  }
  return normalized;
}

function getMinuteOfDayInTimezone(timezone: string, date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function isWeekday(value: string): value is Weekday {
  return WEEKDAY_VALUES.includes(value as Weekday);
}

function listActiveAvailabilityWindowsByHumanIds(humanIds: string[]): Map<string, HumanAvailabilityWindow[]> {
  const map = new Map<string, HumanAvailabilityWindow[]>();
  if (!humanIds.length) {
    return map;
  }

  const placeholders = humanIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, human_id, day_of_week, start_minute, end_minute, timezone, is_active, created_at, updated_at
       FROM human_availability_windows
       WHERE human_id IN (${placeholders}) AND is_active = 1
       ORDER BY start_minute ASC`
    )
    .all(...humanIds) as HumanAvailabilityWindow[];

  for (const row of rows) {
    if (!map.has(row.human_id)) {
      map.set(row.human_id, []);
    }
    map.get(row.human_id)!.push(row);
  }
  return map;
}

export function getDefaultUserId() {
  const row = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(config.MCP_DEFAULT_USER_EMAIL.toLowerCase()) as { id: string } | undefined;

  if (!row) {
    throw new Error(`Default user ${config.MCP_DEFAULT_USER_EMAIL} not found`);
  }
  return row.id;
}

export function listSkills(query?: string): Skill[] {
  if (!query) {
    return db
      .prepare("SELECT id, slug, name, category, description FROM skills ORDER BY name ASC")
      .all() as Skill[];
  }

  const q = `%${query.toLowerCase()}%`;
  return db
    .prepare(
      `SELECT id, slug, name, category, description
       FROM skills
       WHERE lower(slug) LIKE ? OR lower(name) LIKE ? OR lower(description) LIKE ?
       ORDER BY name ASC`
    )
    .all(q, q, q) as Skill[];
}

export function searchHumans(input: {
  query?: string;
  skill?: string;
  minHourlyRateCents?: number;
  maxHourlyRateCents?: number;
  availableOnly?: boolean;
  limit?: number;
  offset?: number;
}): HumanSummary[] {
  const where: string[] = [];
  const params: SqlParams = [];

  if (input.query) {
    const q = `%${input.query.toLowerCase()}%`;
    where.push("(lower(h.display_name) LIKE ? OR lower(h.headline) LIKE ? OR lower(h.bio) LIKE ?)");
    params.push(q, q, q);
  }

  if (typeof input.minHourlyRateCents === "number") {
    where.push("h.hourly_rate_cents >= ?");
    params.push(input.minHourlyRateCents);
  }

  if (typeof input.maxHourlyRateCents === "number") {
    where.push("h.hourly_rate_cents <= ?");
    params.push(input.maxHourlyRateCents);
  }

  if (input.availableOnly) {
    where.push("h.is_available = 1");
  }

  if (input.skill) {
    where.push(
      `EXISTS (
        SELECT 1
        FROM human_skills hsx
        JOIN skills sx ON sx.id = hsx.skill_id
        WHERE hsx.human_id = h.id AND sx.slug = ?
      )`
    );
    params.push(input.skill);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const sql = `
    SELECT
      h.id,
      h.display_name,
      h.headline,
      h.bio,
      h.hourly_rate_cents,
      h.currency,
      h.timezone,
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
    LIMIT ? OFFSET ?
  `;

  const rows = db.prepare(sql).all(...params, limit, offset) as HumanRow[];
  return rows.map(mapHuman);
}

export function getHuman(humanId: string): HumanSummary | null {
  const row = db
    .prepare(
      `SELECT
        h.id,
        h.display_name,
        h.headline,
        h.bio,
        h.hourly_rate_cents,
        h.currency,
        h.timezone,
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
    .get(humanId) as HumanRow | undefined;

  if (!row) {
    return null;
  }

  return mapHuman(row);
}

export function getHumanOwnerUserId(humanId: string): string | null {
  const row = getHumanOwner(humanId);
  if (!row) {
    throw new Error("Human not found");
  }
  return row.user_id;
}

export function listHumanAvailabilityWindows(input: {
  humanId: string;
  activeOnly?: boolean;
}): HumanAvailabilityWindow[] {
  const human = getHumanOwner(input.humanId);
  if (!human) {
    throw new Error("Human not found");
  }

  const where = ["human_id = ?"];
  const params: Array<string | number> = [input.humanId];
  if (input.activeOnly) {
    where.push("is_active = 1");
  }

  return db
    .prepare(
      `SELECT id, human_id, day_of_week, start_minute, end_minute, timezone, is_active, created_at, updated_at
       FROM human_availability_windows
       WHERE ${where.join(" AND ")}
       ORDER BY
         CASE day_of_week
           WHEN 'sun' THEN 0
           WHEN 'mon' THEN 1
           WHEN 'tue' THEN 2
           WHEN 'wed' THEN 3
           WHEN 'thu' THEN 4
           WHEN 'fri' THEN 5
           WHEN 'sat' THEN 6
           ELSE 7
         END ASC,
         start_minute ASC`
    )
    .all(...params) as HumanAvailabilityWindow[];
}

export function setHumanAvailabilityWindow(input: {
  humanId: string;
  dayOfWeek: Weekday;
  startTime: string;
  endTime: string;
  timezone?: string;
  isActive?: boolean;
}): HumanAvailabilityWindow {
  const human = getHumanOwner(input.humanId);
  if (!human) {
    throw new Error("Human not found");
  }

  if (!isWeekday(input.dayOfWeek)) {
    throw new Error("Unsupported dayOfWeek");
  }

  const startMinute = parseTimeToMinute(input.startTime);
  const endMinute = parseTimeToMinute(input.endTime);
  if (endMinute <= startMinute) {
    throw new Error("endTime must be greater than startTime");
  }

  const timezone = (input.timezone || human.timezone || "UTC").trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error("Invalid timezone");
  }

  const existing = db
    .prepare(
      `SELECT id
       FROM human_availability_windows
       WHERE human_id = ? AND day_of_week = ? AND start_minute = ? AND end_minute = ? AND timezone = ?`
    )
    .get(input.humanId, input.dayOfWeek, startMinute, endMinute, timezone) as { id: string } | undefined;

  const ts = now();
  if (existing) {
    db.prepare(
      "UPDATE human_availability_windows SET is_active = ?, updated_at = ? WHERE id = ?"
    ).run(input.isActive === false ? 0 : 1, ts, existing.id);
    return db
      .prepare(
        `SELECT id, human_id, day_of_week, start_minute, end_minute, timezone, is_active, created_at, updated_at
         FROM human_availability_windows
         WHERE id = ?`
      )
      .get(existing.id) as HumanAvailabilityWindow;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO human_availability_windows (
      id, human_id, day_of_week, start_minute, end_minute, timezone, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.humanId, input.dayOfWeek, startMinute, endMinute, timezone, input.isActive === false ? 0 : 1, ts, ts);

  return db
    .prepare(
      `SELECT id, human_id, day_of_week, start_minute, end_minute, timezone, is_active, created_at, updated_at
       FROM human_availability_windows
       WHERE id = ?`
    )
    .get(id) as HumanAvailabilityWindow;
}

export function matchHumansForBounty(input: {
  userId: string;
  bountyId: string;
  limit?: number;
  includeUnavailable?: boolean;
}) {
  const bounty = getBounty(input.userId, input.bountyId);
  if (!bounty) {
    throw new Error("Bounty not found");
  }

  const rows = db
    .prepare(
      `SELECT
         h.id,
         h.display_name,
         h.headline,
         h.bio,
         h.hourly_rate_cents,
         h.currency,
         h.timezone,
         h.rating_avg,
         h.reviews_count,
         h.is_available,
         GROUP_CONCAT(s.slug) AS skills
       FROM humans h
       LEFT JOIN human_skills hs ON hs.human_id = h.id
       LEFT JOIN skills s ON s.id = hs.skill_id
       GROUP BY h.id
       ORDER BY h.rating_avg DESC, h.reviews_count DESC
       LIMIT 500`
    )
    .all() as HumanRow[];

  const windowsByHuman = listActiveAvailabilityWindowsByHumanIds(rows.map((row) => row.id));
  const bountySkill = bounty.skill_slug?.toLowerCase() ?? null;
  const includeUnavailable = input.includeUnavailable ?? false;

  const candidates: BountyMatchCandidate[] = [];
  for (const row of rows) {
    const skills = row.skills ? row.skills.split(",").filter(Boolean) : [];
    const skillMatch = bountySkill ? skills.includes(bountySkill) : true;
    const budgetFit = row.hourly_rate_cents <= bounty.budget_cents;

    const windows = windowsByHuman.get(row.id) ?? [];
    const availabilityWindowMatch = (() => {
      if (!windows.length) {
        return row.is_available === 1;
      }
      return windows.some((window) => {
        const day = getWeekdayInTimezone(window.timezone || row.timezone || "UTC");
        const minute = getMinuteOfDayInTimezone(window.timezone || row.timezone || "UTC");
        return window.day_of_week === day && minute >= window.start_minute && minute < window.end_minute;
      });
    })();

    const availabilityMatch = row.is_available === 1 && availabilityWindowMatch;
    if (!includeUnavailable && !availabilityMatch) {
      continue;
    }

    const skillScore = bountySkill ? (skillMatch ? 45 : 0) : 25;
    const budgetScore = budgetFit ? 20 : Math.max(0, 20 - Math.ceil((row.hourly_rate_cents - bounty.budget_cents) / 2500));
    const ratingScore = Math.round((Math.max(0, Math.min(5, row.rating_avg)) / 5) * 18);
    const reviewScore = Math.round((Math.min(50, row.reviews_count) / 50) * 7);
    const availabilityScore = availabilityMatch ? 15 : 0;
    const score = skillScore + budgetScore + ratingScore + reviewScore + availabilityScore;

    candidates.push({
      human_id: row.id,
      display_name: row.display_name,
      headline: row.headline,
      timezone: row.timezone,
      hourly_rate_cents: row.hourly_rate_cents,
      rating_avg: row.rating_avg,
      reviews_count: row.reviews_count,
      skill_match: skillMatch,
      budget_fit: budgetFit,
      availability_match: availabilityMatch,
      score,
      score_breakdown: {
        skill: skillScore,
        budget: budgetScore,
        rating: ratingScore + reviewScore,
        availability: availabilityScore
      }
    });
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.rating_avg !== left.rating_avg) {
      return right.rating_avg - left.rating_avg;
    }
    return right.reviews_count - left.reviews_count;
  });

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  return {
    bounty,
    generated_at: now(),
    candidates: candidates.slice(0, limit)
  };
}

export function getReviews(humanId: string, limit = 20, offset = 0): Review[] {
  return db
    .prepare(
      `SELECT id, human_id, author_name, rating, comment, created_at
       FROM reviews
       WHERE human_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(humanId, Math.min(Math.max(limit, 1), 100), Math.max(offset, 0)) as Review[];
}

function updateHumanReviewAggregate(humanId: string) {
  const aggregate = db
    .prepare(
      `SELECT COUNT(*) AS reviews_count, COALESCE(AVG(rating), 0) AS rating_avg
       FROM booking_reviews
       WHERE human_id = ?`
    )
    .get(humanId) as { reviews_count?: number | string; rating_avg?: number | string } | undefined;

  const reviewsCount = Number(aggregate?.reviews_count ?? 0);
  const ratingAvgRaw = Number(aggregate?.rating_avg ?? 0);
  const ratingAvg = Number.isFinite(ratingAvgRaw)
    ? Math.round(Math.max(0, Math.min(5, ratingAvgRaw)) * 100) / 100
    : 0;

  db.prepare("UPDATE humans SET reviews_count = ?, rating_avg = ?, updated_at = ? WHERE id = ?").run(
    reviewsCount,
    ratingAvg,
    now(),
    humanId
  );

  return {
    reviews_count: reviewsCount,
    rating_avg: ratingAvg
  };
}

export function createBookingReview(input: {
  userId: string;
  bookingId: string;
  rating: number;
  comment: string;
  authorName?: string;
}): {
  review: Review & { booking_id: string; user_id: string };
  human: {
    id: string;
    rating_avg: number;
    reviews_count: number;
  };
} {
  const booking = db
    .prepare(
      `SELECT id, user_id, human_id, status
       FROM bookings
       WHERE id = ?`
    )
    .get(input.bookingId) as
    | { id: string; user_id: string; human_id: string; status: BookingStatus }
    | undefined;

  if (!booking) {
    throw new Error("Booking not found");
  }
  if (booking.user_id !== input.userId) {
    throw new Error("Forbidden: you can review only your own booking");
  }
  if (booking.status !== "completed") {
    throw new Error("Booking must be completed before leaving a review");
  }

  const existing = db
    .prepare("SELECT id FROM booking_reviews WHERE booking_id = ?")
    .get(input.bookingId) as { id: string } | undefined;
  if (existing) {
    throw new Error("Review already exists for this booking");
  }

  const user = db
    .prepare("SELECT full_name FROM users WHERE id = ?")
    .get(input.userId) as { full_name: string } | undefined;
  if (!user) {
    throw new Error("User not found");
  }

  const normalizedComment = input.comment.trim();
  if (!normalizedComment) {
    throw new Error("Review comment is required");
  }

  const resolvedAuthorName = (input.authorName || user.full_name).trim();
  const authorName = resolvedAuthorName || "Anonymous";
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));

  const reviewId = randomUUID();
  const ts = now();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO booking_reviews (
        id, booking_id, user_id, human_id, author_name, rating, comment, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(reviewId, booking.id, input.userId, booking.human_id, authorName, rating, normalizedComment, ts, ts);

    db.prepare(
      `INSERT INTO reviews (id, human_id, author_name, rating, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(reviewId, booking.human_id, authorName, rating, normalizedComment, ts);

    return updateHumanReviewAggregate(booking.human_id);
  });

  const aggregate = tx();

  const review = db
    .prepare(
      `SELECT id, booking_id, user_id, human_id, author_name, rating, comment, created_at
       FROM booking_reviews
       WHERE id = ?`
    )
    .get(reviewId) as {
    id: string;
    booking_id: string;
    user_id: string;
    human_id: string;
    author_name: string;
    rating: number;
    comment: string;
    created_at: string;
  };

  return {
    review,
    human: {
      id: booking.human_id,
      rating_avg: aggregate.rating_avg,
      reviews_count: aggregate.reviews_count
    }
  };
}

export function createConversation(input: {
  userId: string;
  humanId: string;
  subject: string;
  message: string;
}): { conversation: Conversation; message: Message } {
  const human = getHuman(input.humanId);
  if (!human) {
    throw new Error("Human not found");
  }

  const conversationId = randomUUID();
  const messageId = randomUUID();
  const ts = now();

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO conversations (id, user_id, human_id, subject, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(conversationId, input.userId, input.humanId, input.subject, "open", ts, ts);

    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(messageId, conversationId, "user", input.userId, input.message, ts);
  });

  tx();

  return {
    conversation: getConversationById(input.userId, conversationId)!,
    message: getConversationMessages(conversationId)[0]
  };
}

export function getConversationById(userId: string, conversationId: string): Conversation | null {
  const row = db
    .prepare(
      `SELECT id, user_id, human_id, subject, status, created_at, updated_at
       FROM conversations
       WHERE id = ? AND user_id = ?`
    )
    .get(conversationId, userId) as Conversation | undefined;

  return row ?? null;
}

export function getConversationMessages(conversationId: string): Message[] {
  return db
    .prepare(
      `SELECT id, conversation_id, sender_type, sender_id, body, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    )
    .all(conversationId) as Message[];
}

export function listConversations(input: {
  userId: string;
  status?: ConversationStatus;
  limit?: number;
  offset?: number;
}): Array<Conversation & { last_message: string | null; human_name: string }> {
  const params: SqlParams = [input.userId];
  const where: string[] = ["c.user_id = ?"];

  if (input.status) {
    where.push("c.status = ?");
    params.push(input.status);
  }

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  const rows = db
    .prepare(
      `SELECT
          c.id,
          c.user_id,
          c.human_id,
          c.subject,
          c.status,
          c.created_at,
          c.updated_at,
          h.display_name AS human_name,
          (
            SELECT m.body
            FROM messages m
            WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC
            LIMIT 1
          ) AS last_message
        FROM conversations c
        JOIN humans h ON h.id = c.human_id
        WHERE ${where.join(" AND ")}
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Array<Conversation & { last_message: string | null; human_name: string }>;

  return rows;
}

export function sendConversationMessage(input: {
  userId: string;
  conversationId: string;
  body: string;
}): Message {
  const conversation = getConversationById(input.userId, input.conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  if (conversation.status !== "open") {
    throw new Error("Conversation is closed");
  }

  const messageId = randomUUID();
  const ts = now();

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_type, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(messageId, input.conversationId, "user", input.userId, input.body, ts);

    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(ts, input.conversationId);
  });

  tx();

  return db
    .prepare(
      "SELECT id, conversation_id, sender_type, sender_id, body, created_at FROM messages WHERE id = ?"
    )
    .get(messageId) as Message;
}

export function createBounty(input: {
  userId: string;
  title: string;
  description: string;
  budgetCents: number;
  currency?: string;
  skillSlug?: string;
}): Bounty {
  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO bounties (
      id, user_id, title, description, budget_cents, currency, status, skill_slug, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.title,
    input.description,
    input.budgetCents,
    input.currency ?? "USD",
    "open",
    input.skillSlug ?? null,
    ts,
    ts
  );

  return getBounty(input.userId, id)!;
}

export function listBounties(input: {
  userId: string;
  status?: BountyStatus;
  limit?: number;
  offset?: number;
}): Bounty[] {
  const params: SqlParams = [input.userId];
  const where = ["user_id = ?"];

  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  const offset = Math.max(input.offset ?? 0, 0);

  return db
    .prepare(
      `SELECT id, user_id, title, description, budget_cents, currency, status, skill_slug, created_at, updated_at
       FROM bounties
       WHERE ${where.join(" AND ")}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Bounty[];
}

export function getBounty(userId: string, bountyId: string): Bounty | null {
  const row = db
    .prepare(
      `SELECT id, user_id, title, description, budget_cents, currency, status, skill_slug, created_at, updated_at
       FROM bounties
       WHERE id = ? AND user_id = ?`
    )
    .get(bountyId, userId) as Bounty | undefined;

  return row ?? null;
}

export function getBountyApplications(input: {
  userId: string;
  bountyId: string;
  status?: ApplicationStatus;
}): Array<BountyApplication & { human_name: string }> {
  const bounty = getBounty(input.userId, input.bountyId);
  if (!bounty) {
    throw new Error("Bounty not found");
  }

  const params: SqlParams = [input.bountyId];
  let where = "ba.bounty_id = ?";

  if (input.status) {
    where += " AND ba.status = ?";
    params.push(input.status);
  }

  return db
    .prepare(
      `SELECT
        ba.id,
        ba.bounty_id,
        ba.human_id,
        ba.cover_letter,
        ba.proposed_amount_cents,
        ba.status,
        ba.created_at,
        h.display_name AS human_name
      FROM bounty_applications ba
      JOIN humans h ON h.id = ba.human_id
      WHERE ${where}
      ORDER BY ba.created_at DESC`
    )
    .all(...params) as Array<BountyApplication & { human_name: string }>;
}

export function acceptBountyApplication(input: {
  userId: string;
  bountyId: string;
  applicationId: string;
}): { bounty: Bounty; application: BountyApplication } {
  const bounty = getBounty(input.userId, input.bountyId);
  if (!bounty) {
    throw new Error("Bounty not found");
  }

  const application = db
    .prepare(
      `SELECT id, bounty_id, human_id, cover_letter, proposed_amount_cents, status, created_at
       FROM bounty_applications
       WHERE id = ? AND bounty_id = ?`
    )
    .get(input.applicationId, input.bountyId) as BountyApplication | undefined;

  if (!application) {
    throw new Error("Application not found");
  }

  const ts = now();

  const tx = db.transaction(() => {
    db.prepare("UPDATE bounty_applications SET status = 'rejected', updated_at = ? WHERE bounty_id = ?")
      .run(ts, input.bountyId);
    db.prepare("UPDATE bounty_applications SET status = 'accepted', updated_at = ? WHERE id = ?")
      .run(ts, input.applicationId);
    db.prepare("UPDATE bounties SET status = 'in_progress', updated_at = ? WHERE id = ?").run(ts, input.bountyId);
  });

  tx();

  const updatedApplication = db
    .prepare(
      `SELECT id, bounty_id, human_id, cover_letter, proposed_amount_cents, status, created_at
       FROM bounty_applications
       WHERE id = ?`
    )
    .get(input.applicationId) as BountyApplication;

  return {
    bounty: getBounty(input.userId, input.bountyId)!,
    application: updatedApplication
  };
}

export function updateBounty(input: {
  userId: string;
  bountyId: string;
  title?: string;
  description?: string;
  budgetCents?: number;
  status?: BountyStatus;
  skillSlug?: string | null;
}): Bounty {
  const bounty = getBounty(input.userId, input.bountyId);
  if (!bounty) {
    throw new Error("Bounty not found");
  }

  const patch: string[] = [];
  const values: SqlParams = [];

  if (typeof input.title === "string") {
    patch.push("title = ?");
    values.push(input.title);
  }

  if (typeof input.description === "string") {
    patch.push("description = ?");
    values.push(input.description);
  }

  if (typeof input.budgetCents === "number") {
    patch.push("budget_cents = ?");
    values.push(input.budgetCents);
  }

  if (typeof input.status === "string") {
    patch.push("status = ?");
    values.push(input.status);
  }

  if (input.skillSlug !== undefined) {
    patch.push("skill_slug = ?");
    values.push(input.skillSlug);
  }

  if (!patch.length) {
    return bounty;
  }

  patch.push("updated_at = ?");
  values.push(now());

  db.prepare(`UPDATE bounties SET ${patch.join(", ")} WHERE id = ? AND user_id = ?`).run(
    ...values,
    input.bountyId,
    input.userId
  );

  return getBounty(input.userId, input.bountyId)!;
}

export function applyToBounty(input: {
  applicantUserId: string;
  bountyId: string;
  humanId: string;
  coverLetter: string;
  proposedAmountCents: number;
}): BountyApplication {
  const bounty = db.prepare("SELECT id FROM bounties WHERE id = ?").get(input.bountyId) as
    | { id: string }
    | undefined;

  if (!bounty) {
    throw new Error("Bounty not found");
  }

  const human = db.prepare("SELECT id, user_id FROM humans WHERE id = ?").get(input.humanId) as
    | { id: string; user_id: string | null }
    | undefined;
  if (!human) {
    throw new Error("Human not found");
  }
  if (human.user_id !== input.applicantUserId) {
    throw new Error("You can only apply using your own human profile");
  }

  const existing = db
    .prepare("SELECT id FROM bounty_applications WHERE bounty_id = ? AND human_id = ?")
    .get(input.bountyId, input.humanId) as { id: string } | undefined;

  if (existing) {
    throw new Error("Application already exists");
  }

  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO bounty_applications (
      id, bounty_id, human_id, cover_letter, proposed_amount_cents, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.bountyId, input.humanId, input.coverLetter, input.proposedAmountCents, "applied", ts, ts);

  return db
    .prepare(
      "SELECT id, bounty_id, human_id, cover_letter, proposed_amount_cents, status, created_at FROM bounty_applications WHERE id = ?"
    )
    .get(id) as BountyApplication;
}

export function createBooking(input: {
  userId: string;
  humanId: string;
  startsAt: string;
  endsAt: string;
  note?: string;
}): Booking {
  const human = getHuman(input.humanId);
  if (!human) {
    throw new Error("Human not found");
  }

  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid booking date range");
  }

  const hours = Math.ceil((end.getTime() - start.getTime()) / (60 * 60 * 1000));
  const totalPriceCents = hours * human.hourly_rate_cents;

  const id = randomUUID();
  const ts = now();

  db.prepare(
    `INSERT INTO bookings (
      id, user_id, human_id, starts_at, ends_at, status, note, total_price_cents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.humanId,
    start.toISOString(),
    end.toISOString(),
    "requested",
    input.note ?? null,
    totalPriceCents,
    ts,
    ts
  );

  return getBooking(input.userId, id)!;
}

export function getBooking(userId: string, bookingId: string): Booking | null {
  const row = db
    .prepare(
      `SELECT id, user_id, human_id, starts_at, ends_at, status, note, total_price_cents, created_at, updated_at
       FROM bookings
       WHERE id = ? AND user_id = ?`
    )
    .get(bookingId, userId) as Booking | undefined;

  return row ?? null;
}

export function updateBooking(input: {
  userId: string;
  bookingId: string;
  status?: BookingStatus;
  note?: string | null;
}): Booking {
  const booking = getBooking(input.userId, input.bookingId);
  if (!booking) {
    throw new Error("Booking not found");
  }

  const patch: string[] = [];
  const values: SqlParams = [];

  if (input.status) {
    patch.push("status = ?");
    values.push(input.status);
  }

  if (input.note !== undefined) {
    patch.push("note = ?");
    values.push(input.note);
  }

  if (!patch.length) {
    return booking;
  }

  patch.push("updated_at = ?");
  values.push(now());

  db.prepare(`UPDATE bookings SET ${patch.join(", ")} WHERE id = ? AND user_id = ?`).run(
    ...values,
    input.bookingId,
    input.userId
  );

  return getBooking(input.userId, input.bookingId)!;
}

export function getConversationWithMessages(userId: string, conversationId: string) {
  const conversation = getConversationById(userId, conversationId);
  if (!conversation) {
    return null;
  }
  const messages = getConversationMessages(conversationId);
  const human = getHuman(conversation.human_id);
  return {
    conversation,
    human,
    messages
  };
}

export function getAgentIdentity() {
  return {
    id: config.MCP_AGENT_ID,
    name: config.MCP_AGENT_NAME,
    capabilities: [
      "human_search",
      "conversations",
      "bounties",
      "bookings",
      "reviews",
      "booking_reviews",
      "crypto_payouts",
      "availability_windows",
      "bounty_matching"
    ],
    default_user_email: config.MCP_DEFAULT_USER_EMAIL,
    docs_url: `${config.APP_URL}/api-docs`
  };
}
