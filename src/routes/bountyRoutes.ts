import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  acceptBountyApplication,
  applyToBounty,
  createBounty,
  getBounty,
  getBountyApplications,
  listBounties,
  matchHumansForBounty,
  updateBounty
} from "../services/rentService";

export const bountyRouter = Router();

bountyRouter.use(requireAuth);

const createBountySchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(10000),
  budgetCents: z.coerce.number().int().positive(),
  currency: z.string().length(3).optional(),
  skillSlug: z.string().optional()
});

bountyRouter.post("/bounties", (req, res) => {
  const payload = createBountySchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const bounty = createBounty({
      userId: req.authUser!.id,
      title: payload.data.title,
      description: payload.data.description,
      budgetCents: payload.data.budgetCents,
      currency: payload.data.currency?.toUpperCase(),
      skillSlug: payload.data.skillSlug
    });

    return res.status(201).json({ bounty });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

bountyRouter.get("/bounties", (req, res) => {
  const query = z
    .object({
      status: z.enum(["open", "in_review", "in_progress", "completed", "cancelled"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  const bounties = listBounties({
    userId: req.authUser!.id,
    status: query.data.status,
    limit: query.data.limit,
    offset: query.data.offset
  });

  return res.json({ bounties });
});

bountyRouter.get("/bounties/:bountyId", (req, res) => {
  const bounty = getBounty(req.authUser!.id, req.params.bountyId);
  if (!bounty) {
    return res.status(404).json({ error: "Bounty not found" });
  }
  return res.json({ bounty });
});

const updateBountySchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(10000).optional(),
  budgetCents: z.coerce.number().int().positive().optional(),
  status: z.enum(["open", "in_review", "in_progress", "completed", "cancelled"]).optional(),
  skillSlug: z.string().nullable().optional()
});

bountyRouter.patch("/bounties/:bountyId", (req, res) => {
  const payload = updateBountySchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const bounty = updateBounty({
      userId: req.authUser!.id,
      bountyId: req.params.bountyId,
      title: payload.data.title,
      description: payload.data.description,
      budgetCents: payload.data.budgetCents,
      status: payload.data.status,
      skillSlug: payload.data.skillSlug
    });

    return res.json({ bounty });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

bountyRouter.get("/bounties/:bountyId/applications", (req, res) => {
  const query = z
    .object({
      status: z.enum(["applied", "accepted", "rejected"]).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  try {
    const applications = getBountyApplications({
      userId: req.authUser!.id,
      bountyId: req.params.bountyId,
      status: query.data.status
    });

    return res.json({ applications });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const applySchema = z.object({
  humanId: z.string().uuid(),
  coverLetter: z.string().min(5).max(4000),
  proposedAmountCents: z.coerce.number().int().positive()
});

bountyRouter.post("/bounties/:bountyId/applications", (req, res) => {
  const payload = applySchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const application = applyToBounty({
      applicantUserId: req.authUser!.id,
      bountyId: req.params.bountyId,
      humanId: payload.data.humanId,
      coverLetter: payload.data.coverLetter,
      proposedAmountCents: payload.data.proposedAmountCents
    });
    return res.status(201).json({ application });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

bountyRouter.post("/bounties/:bountyId/applications/:applicationId/accept", (req, res) => {
  try {
    const result = acceptBountyApplication({
      userId: req.authUser!.id,
      bountyId: req.params.bountyId,
      applicationId: req.params.applicationId
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

bountyRouter.get("/bounties/:bountyId/matches", (req, res) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
      includeUnavailable: z
        .enum(["true", "false"])
        .optional()
        .transform((value) => value === "true")
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  try {
    const result = matchHumansForBounty({
      userId: req.authUser!.id,
      bountyId: req.params.bountyId,
      limit: query.data.limit,
      includeUnavailable: query.data.includeUnavailable
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
