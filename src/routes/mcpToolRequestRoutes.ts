import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth";
import {
  createMcpToolCreationRequest,
  getMcpToolCreationRequest,
  listMcpToolCreationRequests,
  markMcpToolRequestImplemented,
  reviewMcpToolCreationRequest
} from "../services/mcpToolRequestService";

const statusEnum = z.enum(["pending_human_review", "approved", "rejected", "implemented"]);

export const mcpToolRequestRouter = Router();

mcpToolRequestRouter.use(requireAuth);

const createSchema = z.object({
  requestedByAgentId: z.string().min(2).max(120).optional(),
  requestSource: z.enum(["agent", "human"]).optional(),
  toolName: z.string().min(3).max(80),
  toolDescription: z.string().min(6).max(400),
  reason: z.string().min(8).max(3000),
  inputSchema: z.record(z.any()),
  outputContract: z.record(z.any()).optional(),
  implementationNotes: z.string().max(4000).optional(),
  targetFiles: z.array(z.string().min(2).max(260)).max(50).optional(),
  prPreference: z.enum(["none", "draft_pr"]).optional()
});

mcpToolRequestRouter.post("/mcp-tools/requests", (req, res) => {
  const payload = createSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const requestedByAgentId =
      req.authUser!.role === "admin"
        ? payload.data.requestedByAgentId ?? req.authUser!.id
        : req.authUser!.id;

    const result = createMcpToolCreationRequest({
      ...payload.data,
      requestedByAgentId
    });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

mcpToolRequestRouter.get("/mcp-tools/requests", (req, res) => {
  const query = z
    .object({
      status: statusEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  const requests = listMcpToolCreationRequests(query.data);
  return res.json({ requests });
});

mcpToolRequestRouter.get("/mcp-tools/requests/:requestId", (req, res) => {
  const request = getMcpToolCreationRequest(req.params.requestId);
  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }
  return res.json(request);
});

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(2000).optional()
});

mcpToolRequestRouter.post("/mcp-tools/requests/:requestId/review", requireRole(["admin"]), (req, res) => {
  const payload = reviewSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = reviewMcpToolCreationRequest({
      requestId: req.params.requestId,
      reviewerId: req.authUser!.id,
      decision: payload.data.decision,
      note: payload.data.note
    });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

const markImplementedSchema = z.object({
  note: z.string().max(2000).optional()
});

mcpToolRequestRouter.post(
  "/mcp-tools/requests/:requestId/implemented",
  requireRole(["admin"]),
  (req, res) => {
    const payload = markImplementedSchema.safeParse(req.body ?? {});
    if (!payload.success) {
      return res.status(400).json({ error: payload.error.flatten() });
    }

    try {
      const result = markMcpToolRequestImplemented({
        requestId: req.params.requestId,
        reviewerId: req.authUser!.id,
        note: payload.data.note
      });
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
  }
);
