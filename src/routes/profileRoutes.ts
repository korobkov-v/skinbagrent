import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  addSkillToProfile,
  getProfileForUser,
  removeSkillFromProfile,
  resendEmailVerification,
  updateProfileForUser,
  verifyEmail
} from "../services/profileService";

export const profileRouter = Router();

profileRouter.use(requireAuth);

profileRouter.get("/profile/me", (req, res) => {
  try {
    const profile = getProfileForUser(req.authUser!.id);
    return res.json({ profile });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

profileRouter.get("/profile/notifications", (req, res) => {
  try {
    const profile = getProfileForUser(req.authUser!.id);
    return res.json({
      notifications: profile.notifications,
      completion: profile.completion,
      verification: profile.verification
    });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const socialLinksSchema = z
  .object({
    twitter: z.string().max(180).optional(),
    linkedin: z.string().max(180).optional(),
    github: z.string().max(180).optional(),
    website: z.string().max(180).optional(),
    instagram: z.string().max(180).optional(),
    youtube: z.string().max(180).optional()
  })
  .partial();

const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  headline: z.string().max(180).optional(),
  bio: z.string().max(4000).optional(),
  city: z.string().max(120).nullable().optional(),
  state: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  available: z.boolean().optional(),
  showEmail: z.boolean().optional(),
  rate: z.coerce.number().positive().max(100000).optional(),
  timezone: z.string().max(80).optional(),
  socialLinks: socialLinksSchema.optional()
});

profileRouter.patch("/profile/me", (req, res) => {
  const payload = updateProfileSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const profile = updateProfileForUser(req.authUser!.id, payload.data);
    return res.json({ profile });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const addSkillSchema = z.object({
  skill: z.string().min(1).max(80)
});

profileRouter.post("/profile/skills", (req, res) => {
  const payload = addSkillSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const profile = addSkillToProfile(req.authUser!.id, payload.data.skill);
    return res.status(201).json({ profile });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

profileRouter.delete("/profile/skills/:skillSlug", (req, res) => {
  try {
    const profile = removeSkillFromProfile(req.authUser!.id, req.params.skillSlug);
    return res.json({ profile });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

profileRouter.post("/profile/email/resend", (req, res) => {
  try {
    const result = resendEmailVerification(req.authUser!.id);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const verifySchema = z.object({
  token: z.string().min(6).max(128).optional()
});

profileRouter.post("/profile/email/verify", (req, res) => {
  const payload = verifySchema.safeParse(req.body ?? {});
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = verifyEmail(req.authUser!.id, payload.data.token);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
