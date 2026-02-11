import type { NextFunction, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { config } from "./config";
import type { User, UserRole } from "./types";
import { signAuthToken, upsertGoogleUser, verifyAuthToken } from "./services/authService";

export const AUTH_COOKIE_NAME = "rent_token";

export function setupPassport() {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL
      },
      (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error("Google profile does not include email"));
          }
          const user = upsertGoogleUser({
            googleId: profile.id,
            email,
            fullName: profile.displayName || email,
            avatarUrl: profile.photos?.[0]?.value
          });
          return done(null, user);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, (user as { id: string }).id));
  passport.deserializeUser((id, done) => done(null, { id }));
}

function extractBearer(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearer(req) ?? req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    return next();
  }
  const user = verifyAuthToken(token);
  if (user) {
    req.authUser = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE_NAME);
}

export function issueAuthForUser(res: Response, user: User) {
  const token = signAuthToken(user);
  setAuthCookie(res, token);
  return token;
}
