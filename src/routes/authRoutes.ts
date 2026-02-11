import { Router } from "express";
import passport from "passport";
import { z } from "zod";
import { clearAuthCookie, issueAuthForUser, requireAuth, requireRole } from "../auth";
import { issueCsrfToken } from "../middleware/csrf";
import { createRateLimiter } from "../middleware/rateLimit";
import { config } from "../config";
import {
  createCompatApiKey,
  listCompatApiKeys,
  revokeCompatApiKey
} from "../services/compatApiKeyService";
import { upsertGoogleUser } from "../services/authService";
import { verifyFirebaseIdToken } from "../services/firebaseAuthService";
import type { User } from "../types";

const googleEnabled = Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
const GOOGLE_ONLY_AUTH_ERROR = "Email/password authentication is disabled. Continue with Google.";
const firebaseAuthSchema = z.object({
  idToken: z.string().min(100).max(4096)
});

export const authApiRouter = Router();
const authGeneralLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: "Too many auth requests"
});

authApiRouter.use(authGeneralLimiter);

authApiRouter.get("/csrf", issueCsrfToken);

authApiRouter.post("/register", (_req, res) => {
  return res.status(403).json({
    error: GOOGLE_ONLY_AUTH_ERROR,
    redirectUrl: "/login"
  });
});

authApiRouter.post("/login", (_req, res) => {
  return res.status(403).json({
    error: GOOGLE_ONLY_AUTH_ERROR,
    redirectUrl: "/login"
  });
});

authApiRouter.post("/firebase", async (req, res) => {
  const payload = firebaseAuthSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const verified = await verifyFirebaseIdToken(payload.data.idToken, config.FIREBASE_PROJECT_ID);
    if (!verified.email) {
      return res.status(400).json({ error: "Firebase account does not include an email" });
    }

    const user = upsertGoogleUser({
      googleId: verified.googleId || verified.uid,
      email: verified.email,
      fullName: verified.fullName,
      avatarUrl: verified.avatarUrl
    });

    issueAuthForUser(res, user);
    return res.json({ user });
  } catch (error) {
    return res.status(401).json({ error: (error as Error).message || "Firebase sign-in failed" });
  }
});

authApiRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.status(204).send();
});

authApiRouter.get("/me", requireAuth, (req, res) => {
  return res.json({ user: req.authUser });
});

const keyScopeSchema = z.enum(["compat:read", "compat:write", "compat:admin"]);
const createApiKeySchema = z.object({
  name: z.string().min(2).max(120),
  agentId: z.string().min(2).max(120),
  agentType: z.string().min(2).max(80).optional(),
  scopes: z.array(keyScopeSchema).min(1).max(8).optional()
});

authApiRouter.get("/api-keys", requireAuth, requireRole(["admin"]), (_req, res) => {
  return res.json({ keys: listCompatApiKeys() });
});

authApiRouter.post("/api-keys", requireAuth, requireRole(["admin"]), (req, res) => {
  const payload = createApiKeySchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = createCompatApiKey({
      ...payload.data,
      createdByUserId: req.authUser!.id
    });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

authApiRouter.post("/api-keys/:keyId/revoke", requireAuth, requireRole(["admin"]), (req, res) => {
  try {
    revokeCompatApiKey(req.params.keyId);
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

export const googleAuthRouter = Router();

googleAuthRouter.get("/google", (req, res, next) => {
  if (!googleEnabled) {
    return res.redirect(`/login?error=${encodeURIComponent("Google OAuth is not configured")}`);
  }
  return passport.authenticate("google", {
    session: false,
    scope: ["profile", "email"]
  })(req, res, next);
});

googleAuthRouter.get("/google/callback", (req, res, next) => {
  if (!googleEnabled) {
    return res.redirect(`/login?error=${encodeURIComponent("Google OAuth is not configured")}`);
  }

  return passport.authenticate(
    "google",
    { session: false },
    (err: Error | null, user: User | false) => {
      if (err || !user) {
        return res.redirect(`/login?error=${encodeURIComponent("Google authorization failed")}`);
      }
      issueAuthForUser(res, user);
      return res.redirect("/app");
    }
  )(req, res, next);
});
