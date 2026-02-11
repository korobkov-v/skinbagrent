import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const BEARER_PREFIX = "bearer ";

function isBearerTokenRequest(req: Request): boolean {
  const auth = req.header("authorization");
  return typeof auth === "string" && auth.toLowerCase().startsWith(BEARER_PREFIX);
}

function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomUUID().replace(/-/g, "");
  }
  return req.session.csrfToken;
}

export function issueCsrfToken(req: Request, res: Response) {
  const token = ensureCsrfToken(req);
  return res.json({ csrfToken: token });
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (req.compatApiKey) {
    return next();
  }

  if (isBearerTokenRequest(req)) {
    return next();
  }

  const token = ensureCsrfToken(req);
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const providedToken = req.header("x-csrf-token");
  if (!providedToken || providedToken !== token) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  return next();
}
