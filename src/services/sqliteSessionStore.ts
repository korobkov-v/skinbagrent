import session from "express-session";
import { db } from "../db/client";

interface SessionRow {
  sess: string;
  expires_at: number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function resolveExpiry(sessionData: session.SessionData): number {
  const expires = sessionData.cookie?.expires;
  if (expires) {
    const timestamp = new Date(expires).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  return Date.now() + DEFAULT_TTL_MS;
}

export class SqliteSessionStore extends session.Store {
  private cleanupTimer: NodeJS.Timeout;

  constructor(cleanupIntervalMs = 15 * 60 * 1000) {
    super();
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, cleanupIntervalMs);
    this.cleanupTimer.unref();
  }

  get(sid: string, callback: (err?: unknown, session?: session.SessionData | null) => void) {
    try {
      const row = db
        .prepare("SELECT sess, expires_at FROM user_sessions WHERE sid = ?")
        .get(sid) as SessionRow | undefined;

      if (!row) {
        callback(undefined, null);
        return;
      }

      if (row.expires_at <= Date.now()) {
        db.prepare("DELETE FROM user_sessions WHERE sid = ?").run(sid);
        callback(undefined, null);
        return;
      }

      callback(undefined, JSON.parse(row.sess) as session.SessionData);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, sessionData: session.SessionData, callback?: (err?: unknown) => void) {
    try {
      const serialized = JSON.stringify(sessionData);
      const expiresAt = resolveExpiry(sessionData);
      const ts = new Date().toISOString();

      db.prepare(
        `INSERT INTO user_sessions (sid, sess, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET
           sess = excluded.sess,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at`
      ).run(sid, serialized, expiresAt, ts, ts);

      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void) {
    try {
      db.prepare("DELETE FROM user_sessions WHERE sid = ?").run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, sessionData: session.SessionData, callback?: (err?: unknown) => void) {
    try {
      const expiresAt = resolveExpiry(sessionData);
      const ts = new Date().toISOString();
      db.prepare("UPDATE user_sessions SET expires_at = ?, updated_at = ? WHERE sid = ?").run(
        expiresAt,
        ts,
        sid
      );
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  close() {
    clearInterval(this.cleanupTimer);
  }

  private cleanupExpired() {
    db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(Date.now());
  }
}
