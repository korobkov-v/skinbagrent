import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  authenticateCompatApiKey,
  canUseCompatScope
} from "../services/compatApiKeyService";
import { createRateLimiter, getRequestIp } from "../middleware/rateLimit";
import {
  createApiBooking,
  createApiHuman,
  getApiBooking,
  getApiHuman,
  listApiBookings,
  listApiHumans,
  updateApiBooking
} from "../services/compatApiService";

export const rentahumanCompatRouter = Router();

const success = (payload: Record<string, unknown>) => ({ success: true, ...payload });
const fail = (error: string) => ({ success: false, error });
const COMPAT_PATH_PREFIXES = ["/humans", "/bookings"];

function isCompatPath(pathname: string): boolean {
  return COMPAT_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

interface ExtractedApiKey {
  value: string;
  source: "x-api-key" | "authorization";
}

function extractApiKey(req: Request): ExtractedApiKey | null {
  const header = req.header("x-api-key");
  if (header?.trim()) {
    return {
      value: header.trim(),
      source: "x-api-key"
    };
  }

  const auth = req.header("authorization");
  if (!auth) {
    return null;
  }

  const [scheme, value] = auth.split(" ");
  if (!scheme || !value || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return {
    value: value.trim(),
    source: "authorization"
  };
}

function looksLikeJwt(token: string): boolean {
  return token.split(".").length === 3;
}

function requireCompatApiKey(req: Request, res: Response, next: NextFunction) {
  if (!isCompatPath(req.path)) {
    return next();
  }

  const extracted = extractApiKey(req);
  if (!extracted) {
    return next();
  }

  const keyContext = authenticateCompatApiKey(extracted.value);
  if (!keyContext) {
    if (extracted.source === "authorization" && looksLikeJwt(extracted.value)) {
      return next();
    }
    return res.status(401).json(fail("Invalid API key"));
  }

  req.compatApiKey = keyContext;
  next();
}

function requireCompatScope(scope: "compat:read" | "compat:write" | "compat:admin") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.compatApiKey) {
      return next("route");
    }
    const scopes = req.compatApiKey?.scopes ?? [];
    if (!canUseCompatScope(scopes, scope)) {
      return res.status(403).json(fail(`API key scope '${scope}' is required`));
    }
    next();
  };
}

function hasCompatAdminScope(req: Request) {
  return canUseCompatScope(req.compatApiKey?.scopes ?? [], "compat:admin");
}

const compatRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 240,
  keyGenerator: (req) => `${req.compatApiKey?.id ?? "anon"}:${getRequestIp(req)}`,
  message: "Compat API rate limit exceeded"
});

const compatWriteRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req) => `${req.compatApiKey?.id ?? "anon"}:${getRequestIp(req)}`,
  message: "Compat API write rate limit exceeded"
});

rentahumanCompatRouter.use(requireCompatApiKey);
rentahumanCompatRouter.use((req, res, next) => {
  if (!isCompatPath(req.path) || !req.compatApiKey) {
    return next();
  }
  return compatRateLimiter(req, res, next);
});

const listHumansQuery = z.object({
  skill: z.string().optional(),
  minRate: z.coerce.number().min(0).optional(),
  maxRate: z.coerce.number().min(0).optional(),
  name: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

rentahumanCompatRouter.get("/humans", requireCompatScope("compat:read"), (req, res) => {
  const payload = listHumansQuery.safeParse(req.query);
  if (!payload.success) {
    return res.status(400).json(fail(payload.error.flatten().formErrors.join("; ") || "Invalid query"));
  }

  try {
    const humans = listApiHumans(payload.data);
    return res.json(success({ humans, count: humans.length }));
  } catch (error) {
    return res.status(400).json(fail((error as Error).message));
  }
});

rentahumanCompatRouter.get("/humans/:id", requireCompatScope("compat:read"), (req, res) => {
  const human = getApiHuman(req.params.id);
  if (!human) {
    return res.status(404).json(fail("Human not found"));
  }
  return res.json(success({ human }));
});

const createHumanBody = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  skills: z.array(z.string().min(1).max(80)).min(1),
  cryptoWallets: z
    .array(
      z.object({
        chain: z.string().min(2).max(30),
        network: z.string().min(2).max(20).optional(),
        tokenSymbol: z.string().min(2).max(12).optional(),
        address: z.string().min(10).max(120),
        label: z.string().min(1).max(120).optional(),
        destinationTag: z.string().max(120).nullable().optional()
      })
    )
    .min(1),
  headline: z.string().min(2).max(180).optional(),
  bio: z.string().min(4).max(4000).optional(),
  hourlyRate: z.coerce.number().positive().max(100000).optional(),
  timezone: z.string().min(2).max(80).optional()
});

rentahumanCompatRouter.post(
  "/humans",
  requireCompatScope("compat:write"),
  compatWriteRateLimiter,
  (req, res) => {
    const payload = createHumanBody.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json(fail(payload.error.flatten().formErrors.join("; ") || "Invalid payload"));
    }

    try {
      const human = createApiHuman(payload.data);
      return res.status(201).json(success({ human }));
    } catch (error) {
      return res.status(400).json(fail((error as Error).message));
    }
  }
);

const listBookingsQuery = z.object({
  humanId: z.string().optional(),
  agentId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

rentahumanCompatRouter.get("/bookings", requireCompatScope("compat:read"), (req, res) => {
  const payload = listBookingsQuery.safeParse(req.query);
  if (!payload.success) {
    return res.status(400).json(fail(payload.error.flatten().formErrors.join("; ") || "Invalid query"));
  }

  try {
    const isAdmin = hasCompatAdminScope(req);
    if (!isAdmin && payload.data.agentId && payload.data.agentId !== req.compatApiKey!.agentId) {
      return res.status(403).json(fail("agentId does not match API key"));
    }

    const bookings = listApiBookings({
      ...payload.data,
      agentId: isAdmin ? payload.data.agentId : req.compatApiKey!.agentId
    });
    return res.json(success({ bookings, count: bookings.length }));
  } catch (error) {
    return res.status(400).json(fail((error as Error).message));
  }
});

const createBookingBody = z.object({
  humanId: z.string().min(2).max(120),
  agentId: z.string().min(2).max(120).optional(),
  agentType: z.string().min(2).max(80).optional(),
  taskTitle: z.string().min(3).max(200),
  taskDescription: z.string().min(3).max(5000).optional(),
  startTime: z.string().datetime(),
  estimatedHours: z.coerce.number().positive().max(1000)
});

rentahumanCompatRouter.post(
  "/bookings",
  requireCompatScope("compat:write"),
  compatWriteRateLimiter,
  (req, res) => {
    const payload = createBookingBody.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json(fail(payload.error.flatten().formErrors.join("; ") || "Invalid payload"));
    }

    try {
      const isAdmin = hasCompatAdminScope(req);
      if (!isAdmin && payload.data.agentId && payload.data.agentId !== req.compatApiKey!.agentId) {
        return res.status(403).json(fail("agentId does not match API key"));
      }

      const effectiveAgentId = isAdmin
        ? payload.data.agentId ?? req.compatApiKey!.agentId
        : req.compatApiKey!.agentId;

      const booking = createApiBooking({
        ...payload.data,
        agentId: effectiveAgentId,
        agentType: payload.data.agentType ?? req.compatApiKey!.agentType ?? undefined
      });
      return res.status(201).json(success({ booking }));
    } catch (error) {
      return res.status(400).json(fail((error as Error).message));
    }
  }
);

rentahumanCompatRouter.get("/bookings/:id", requireCompatScope("compat:read"), (req, res) => {
  const booking = getApiBooking(req.params.id);
  if (!booking) {
    return res.status(404).json(fail("Booking not found"));
  }
  const isAdmin = hasCompatAdminScope(req);
  if (!isAdmin && booking.agentId !== req.compatApiKey!.agentId) {
    return res.status(404).json(fail("Booking not found"));
  }
  return res.json(success({ booking }));
});

const patchBookingBody = z.object({
  status: z.enum(["pending", "confirmed", "in_progress", "completed", "cancelled"]).optional(),
  paymentTxHash: z.string().min(8).max(160).nullable().optional()
});

rentahumanCompatRouter.patch(
  "/bookings/:id",
  requireCompatScope("compat:write"),
  compatWriteRateLimiter,
  (req, res) => {
    const payload = patchBookingBody.safeParse(req.body);
    if (!payload.success) {
      return res.status(400).json(fail(payload.error.flatten().formErrors.join("; ") || "Invalid payload"));
    }

    try {
      const existing = getApiBooking(req.params.id);
      if (!existing) {
        return res.status(404).json(fail("Booking not found"));
      }
      const isAdmin = hasCompatAdminScope(req);
      if (!isAdmin && existing.agentId !== req.compatApiKey!.agentId) {
        return res.status(404).json(fail("Booking not found"));
      }

      const booking = updateApiBooking({
        bookingId: req.params.id,
        status: payload.data.status,
        paymentTxHash: payload.data.paymentTxHash
      });
      return res.json(success({ booking }));
    } catch (error) {
      return res.status(400).json(fail((error as Error).message));
    }
  }
);
