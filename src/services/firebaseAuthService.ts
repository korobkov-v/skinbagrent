import jwt, { type JwtPayload } from "jsonwebtoken";

const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const CACHE_SKEW_MS = 30_000;

interface CachedFirebaseCerts {
  certs: Record<string, string>;
  expiresAt: number;
}

interface FirebaseTokenPayload extends JwtPayload {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    identities?: Record<string, string[]>;
  };
}

export interface VerifiedFirebaseToken {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string | undefined;
  googleId: string | undefined;
}

let certCache: CachedFirebaseCerts | null = null;

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseCacheControlMaxAge(header: string | null): number {
  if (!header) {
    return 300;
  }
  const match = header.match(/max-age=(\d+)/i);
  if (!match) {
    return 300;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 300;
  }
  return parsed;
}

function getGoogleIdentity(payload: FirebaseTokenPayload): string | undefined {
  const googleIdentities = payload.firebase?.identities?.["google.com"];
  if (!Array.isArray(googleIdentities) || googleIdentities.length === 0) {
    return undefined;
  }

  const first = googleIdentities[0];
  if (typeof first !== "string" || !first.trim()) {
    return undefined;
  }
  return first.trim();
}

function parseJwtHeader(token: string): { alg?: string; kid?: string } {
  const [headerSegment] = token.split(".");
  if (!headerSegment) {
    throw new Error("Invalid Firebase ID token");
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(headerSegment)) as { alg?: string; kid?: string };
    return parsed;
  } catch {
    throw new Error("Invalid Firebase ID token");
  }
}

async function loadFirebaseCerts(forceRefresh = false): Promise<Record<string, string>> {
  if (!forceRefresh && certCache && Date.now() < certCache.expiresAt) {
    return certCache.certs;
  }

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) {
    throw new Error("Failed to load Firebase signing certificates");
  }

  const certs = (await response.json()) as Record<string, string>;
  if (!certs || typeof certs !== "object") {
    throw new Error("Invalid Firebase certificate response");
  }

  const maxAgeSeconds = parseCacheControlMaxAge(response.headers.get("cache-control"));
  certCache = {
    certs,
    expiresAt: Date.now() + maxAgeSeconds * 1000 - CACHE_SKEW_MS
  };

  return certs;
}

function normalizeFullName(payload: FirebaseTokenPayload, email: string | null): string {
  if (typeof payload.name === "string" && payload.name.trim()) {
    return payload.name.trim();
  }
  if (email) {
    return email;
  }
  return "Google user";
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string
): Promise<VerifiedFirebaseToken> {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing Firebase ID token");
  }
  if (!projectId || typeof projectId !== "string") {
    throw new Error("Firebase project is not configured");
  }

  const header = parseJwtHeader(idToken);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Invalid Firebase ID token");
  }

  let certs = await loadFirebaseCerts();
  let certificate = certs[header.kid];
  if (!certificate) {
    certs = await loadFirebaseCerts(true);
    certificate = certs[header.kid];
  }
  if (!certificate) {
    throw new Error("Invalid Firebase ID token");
  }

  let payload: FirebaseTokenPayload;
  try {
    payload = jwt.verify(idToken, certificate, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`
    }) as FirebaseTokenPayload;
  } catch {
    throw new Error("Invalid Firebase ID token");
  }

  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new Error("Invalid Firebase ID token");
  }

  const email =
    typeof payload.email === "string" && payload.email.trim() ? payload.email.toLowerCase() : null;
  const avatarUrl =
    typeof payload.picture === "string" && payload.picture.trim() ? payload.picture.trim() : undefined;

  return {
    uid: payload.sub.trim(),
    email,
    emailVerified: payload.email_verified === true,
    fullName: normalizeFullName(payload, email),
    avatarUrl,
    googleId: getGoogleIdentity(payload)
  };
}
