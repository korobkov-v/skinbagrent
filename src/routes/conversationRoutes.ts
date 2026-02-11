import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import {
  createConversation,
  getConversationWithMessages,
  listConversations,
  sendConversationMessage
} from "../services/rentService";

export const conversationRouter = Router();

conversationRouter.use(requireAuth);

const createConversationSchema = z.object({
  humanId: z.string().uuid(),
  subject: z.string().min(2).max(180).optional(),
  message: z.string().min(1).max(4000)
});

conversationRouter.post("/conversations", (req, res) => {
  const payload = createConversationSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const result = createConversation({
      userId: req.authUser!.id,
      humanId: payload.data.humanId,
      subject: payload.data.subject || "New conversation",
      message: payload.data.message
    });

    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

conversationRouter.get("/conversations", (req, res) => {
  const query = z
    .object({
      status: z.enum(["open", "closed"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    })
    .safeParse(req.query);

  if (!query.success) {
    return res.status(400).json({ error: query.error.flatten() });
  }

  const conversations = listConversations({
    userId: req.authUser!.id,
    status: query.data.status,
    limit: query.data.limit,
    offset: query.data.offset
  });

  return res.json({ conversations });
});

conversationRouter.get("/conversations/:conversationId", (req, res) => {
  const conversation = getConversationWithMessages(req.authUser!.id, req.params.conversationId);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  return res.json(conversation);
});

const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000)
});

conversationRouter.post("/conversations/:conversationId/messages", (req, res) => {
  const payload = sendMessageSchema.safeParse(req.body);
  if (!payload.success) {
    return res.status(400).json({ error: payload.error.flatten() });
  }

  try {
    const message = sendConversationMessage({
      userId: req.authUser!.id,
      conversationId: req.params.conversationId,
      body: payload.data.body
    });

    return res.status(201).json({ message });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});
