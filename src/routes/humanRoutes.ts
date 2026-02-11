import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  getHuman,
  getHumanOwnerUserId,
  getReviews,
  listHumanAvailabilityWindows,
  listSkills,
  searchHumans,
  setHumanAvailabilityWindow
} from "../services/rentService";

export const humanRouter = Router();

const searchSchema = z.object({
  query: z.string().optional(),
  skill: z.string().optional(),
  minRate: z.coerce.number().int().min(0).optional(),
  maxRate: z.coerce.number().int().min(0).optional(),
  availableOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

humanRouter.get("/skills", (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : undefined;
  const skills = listSkills(query);
  return res.json({ skills });
});

humanRouter.get("/humans", (req, res) => {
  const payload = searchSchema.safeParse(req.query);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  const humans = searchHumans({
    query: payload.data.query,
    skill: payload.data.skill,
    minHourlyRateCents: payload.data.minRate,
    maxHourlyRateCents: payload.data.maxRate,
    availableOnly: payload.data.availableOnly,
    limit: payload.data.limit,
    offset: payload.data.offset
  });

  return res.json({ humans });
});

humanRouter.get("/humans/:humanId", (req, res) => {
  const human = getHuman(req.params.humanId);
  if (!human) {
    return res.status(404).json({ error: "Human not found" });
  }
  return res.json({ human });
});

humanRouter.get("/humans/:humanId/reviews", (req, res) => {
  const reviewQuery = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!reviewQuery.success) {
    return res.status(400).json({ error: reviewQuery.error.flatten() });
  }

  const human = getHuman(req.params.humanId);
  if (!human) {
    return res.status(404).json({ error: "Human not found" });
  }

  const reviews = getReviews(req.params.humanId, reviewQuery.data.limit, reviewQuery.data.offset);
  return res.json({ reviews });
});

humanRouter.get("/humans/:humanId/availability-windows", (req, res) => {
  const query = z
    .object({
      activeOnly: z
        .enum(["true", "false"])
        .optional()
        .transform((value) => value === "true")
    })
    .safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  try {
    const windows = listHumanAvailabilityWindows({
      humanId: req.params.humanId,
      activeOnly: query.data.activeOnly
    });
    return res.json({ windows });
  } catch (error) {
    return res.status(404).json({ error: (error as Error).message });
  }
});

const availabilityWindowSchema = z.object({
  dayOfWeek: z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().min(2).max(120).optional(),
  isActive: z.boolean().optional()
});

humanRouter.post("/humans/:humanId/availability-windows", requireAuth, (req, res) => {
  const payload = availabilityWindowSchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const ownerUserId = getHumanOwnerUserId(req.params.humanId);
    const isAdmin = req.authUser!.role === "admin";
    if (!isAdmin && ownerUserId !== req.authUser!.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const window = setHumanAvailabilityWindow({
      humanId: req.params.humanId,
      dayOfWeek: payload.data.dayOfWeek,
      startTime: payload.data.startTime,
      endTime: payload.data.endTime,
      timezone: payload.data.timezone,
      isActive: payload.data.isActive
    });
    const windows = listHumanAvailabilityWindows({
      humanId: req.params.humanId
    });
    return res.status(201).json({ window, windows });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
