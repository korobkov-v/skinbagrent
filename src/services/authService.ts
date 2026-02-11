import { randomUUID } from "crypto";
import { compareSync, hashSync } from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../db/client";
import { config } from "../config";
import type { User } from "../types";

interface UserRow extends User {
  password_hash: string | null;
}

function mapUser(row: UserRow | undefined): User | null {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    avatar_url: row.avatar_url,
    auth_provider: row.auth_provider,
    google_id: row.google_id,
    email_verified: row.email_verified,
    email_verified_at: row.email_verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function findUserByEmail(email: string): (User & { password_hash: string | null }) | null {
  const row = db
    .prepare(
      "SELECT id, email, full_name, role, avatar_url, auth_provider, google_id, email_verified, email_verified_at, created_at, updated_at, password_hash FROM users WHERE email = ?"
    )
    .get(email.toLowerCase()) as UserRow | undefined;
  if (!row) {
    return null;
  }
  return row;
}

export function findUserById(id: string): User | null {
  const row = db
    .prepare(
      "SELECT id, email, full_name, role, avatar_url, auth_provider, google_id, email_verified, email_verified_at, created_at, updated_at, password_hash FROM users WHERE id = ?"
    )
    .get(id) as UserRow | undefined;
  return mapUser(row);
}

export function createLocalUser(input: {
  email: string;
  password: string;
  fullName: string;
}): User {
  const existing = findUserByEmail(input.email);
  if (existing) {
    throw new Error("Email already registered");
  }

  const id = randomUUID();
  const ts = new Date().toISOString();
  const passwordHash = hashSync(input.password, 10);

  db.prepare(
    `INSERT INTO users (
      id, email, password_hash, full_name, role, avatar_url, auth_provider, google_id, email_verified, email_verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.email.toLowerCase(), passwordHash, input.fullName, "client", null, "local", null, 0, null, ts, ts);

  const user = findUserById(id);
  if (!user) {
    throw new Error("Failed to create user");
  }
  return user;
}

export function verifyLocalCredentials(email: string, password: string): User | null {
  const user = findUserByEmail(email);
  if (!user || !user.password_hash) {
    return null;
  }
  if (!compareSync(password, user.password_hash)) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    avatar_url: user.avatar_url,
    auth_provider: user.auth_provider,
    google_id: user.google_id,
    email_verified: user.email_verified,
    email_verified_at: user.email_verified_at,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

export function upsertGoogleUser(input: {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
}): User {
  const ts = new Date().toISOString();
  const existingByGoogle = db
    .prepare(
      "SELECT id, email, full_name, role, avatar_url, auth_provider, google_id, email_verified, email_verified_at, created_at, updated_at, password_hash FROM users WHERE google_id = ?"
    )
    .get(input.googleId) as UserRow | undefined;

  if (existingByGoogle) {
    db.prepare(
      "UPDATE users SET email = ?, full_name = ?, avatar_url = ?, email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?"
    ).run(input.email.toLowerCase(), input.fullName, input.avatarUrl || null, ts, ts, existingByGoogle.id);
    const updated = findUserById(existingByGoogle.id);
    if (!updated) {
      throw new Error("Failed to update Google user");
    }
    return updated;
  }

  const existingByEmail = findUserByEmail(input.email);
  if (existingByEmail) {
    db.prepare(
      "UPDATE users SET google_id = ?, auth_provider = ?, avatar_url = COALESCE(?, avatar_url), email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?"
    ).run(input.googleId, "google", input.avatarUrl || null, ts, ts, existingByEmail.id);
    const updated = findUserById(existingByEmail.id);
    if (!updated) {
      throw new Error("Failed to link Google account");
    }
    return updated;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (
      id, email, password_hash, full_name, role, avatar_url, auth_provider, google_id, email_verified, email_verified_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.email.toLowerCase(),
    null,
    input.fullName,
    "client",
    input.avatarUrl || null,
    "google",
    input.googleId,
    1,
    ts,
    ts,
    ts
  );

  const user = findUserById(id);
  if (!user) {
    throw new Error("Failed to create Google user");
  }
  return user;
}

export function signAuthToken(user: User): string {
  const expiresIn = config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.full_name
    },
    config.JWT_SECRET,
    { expiresIn }
  );
}

export function verifyAuthToken(token: string): User | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as { sub: string };
    return findUserById(decoded.sub);
  } catch {
    return null;
  }
}
