import type { NextFunction, Request, Response } from "express";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
}

const DEFAULT_MESSAGE = "Too many requests";

function cleanupExpired(store: Map<string, RateLimitBucket>, nowMs: number) {
  if (store.size < 1024) {
    return;
  }

  for (const [key, value] of store.entries()) {
    if (value.resetAt <= nowMs) {
      store.delete(key);
    }
  }
}

export function getRequestIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function createRateLimiter(options: RateLimitOptions) {
  const store = new Map<string, RateLimitBucket>();
  const keyGenerator = options.keyGenerator ?? ((req: Request) => getRequestIp(req));
  const message = options.message ?? DEFAULT_MESSAGE;

  return (req: Request, res: Response, next: NextFunction) => {
    const nowMs = Date.now();
    cleanupExpired(store, nowMs);

    const key = keyGenerator(req);
    const existing = store.get(key);

    if (!existing || existing.resetAt <= nowMs) {
      store.set(key, { count: 1, resetAt: nowMs + options.windowMs });
      res.setHeader("X-RateLimit-Limit", String(options.max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(options.max - 1, 0)));
      return next();
    }

    existing.count += 1;
    store.set(key, existing);

    const remaining = Math.max(options.max - existing.count, 0);
    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (existing.count > options.max) {
      const retryAfterSeconds = Math.max(Math.ceil((existing.resetAt - nowMs) / 1000), 1);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: message,
        retryAfterSeconds
      });
    }

    next();
  };
}
