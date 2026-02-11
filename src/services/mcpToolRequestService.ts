import { randomUUID } from "crypto";
import { db } from "../db/client";
import type {
  McpToolPrDraft,
  McpToolPrPreference,
  McpToolRequest,
  McpToolRequestSource,
  McpToolRequestStatus
} from "../types";

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{2,64}$/;

const now = () => new Date().toISOString();

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function getRequestById(requestId: string): McpToolRequest | null {
  const row = db.prepare("SELECT * FROM mcp_tool_requests WHERE id = ?").get(requestId) as
    | McpToolRequest
    | undefined;
  return row ?? null;
}

function getPrDraftByRequestId(requestId: string): McpToolPrDraft | null {
  const row = db.prepare("SELECT * FROM mcp_tool_pr_drafts WHERE request_id = ?").get(requestId) as
    | McpToolPrDraft
    | undefined;
  return row ?? null;
}

function createPrDraftForRequest(request: McpToolRequest): McpToolPrDraft {
  const existing = getPrDraftByRequestId(request.id);
  if (existing) {
    return existing;
  }

  const ts = now();
  const branchName = `codex/mcp-tool-${slugify(request.tool_name)}`;
  const commitTitle = `feat(mcp): propose ${request.tool_name} tool`;
  const prTitle = `feat: add MCP tool request for ${request.tool_name}`;
  const prBody = [
    `## MCP Tool Proposal`,
    "",
    `- Request ID: ${request.id}`,
    `- Tool name: ${request.tool_name}`,
    `- Source: ${request.request_source}`,
    "",
    "## Why",
    request.reason,
    "",
    "## Tool input schema",
    "```json",
    request.input_schema_json,
    "```",
    "",
    "## Output contract",
    request.output_contract_json || "(not provided)",
    "",
    "## Human Review Gate",
    "- [ ] Human reviewed feature scope",
    "- [ ] Human approved implementation details",
    "- [ ] Human approved rollout"
  ].join("\n");

  const draftId = randomUUID();
  db.prepare(
    `INSERT INTO mcp_tool_pr_drafts (
      id, request_id, branch_name, commit_title, pr_title, pr_body, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(draftId, request.id, branchName, commitTitle, prTitle, prBody, "draft", ts, ts);

  return getPrDraftByRequestId(request.id)!;
}

export function createMcpToolCreationRequest(input: {
  requestedByAgentId: string;
  requestSource?: McpToolRequestSource;
  toolName: string;
  toolDescription: string;
  reason: string;
  inputSchema: unknown;
  outputContract?: unknown;
  implementationNotes?: string;
  targetFiles?: string[];
  prPreference?: McpToolPrPreference;
}) {
  const toolName = normalizeToolName(input.toolName);
  if (!TOOL_NAME_PATTERN.test(toolName)) {
    throw new Error(
      "toolName must match pattern ^[a-z][a-z0-9_]{2,64}$ (lowercase snake_case recommended)"
    );
  }

  const duplicate = db
    .prepare(
      `SELECT id FROM mcp_tool_requests
       WHERE tool_name = ? AND status IN ('pending_human_review', 'approved', 'implemented')
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(toolName) as { id: string } | undefined;

  if (duplicate) {
    throw new Error(`A request for tool '${toolName}' already exists: ${duplicate.id}`);
  }

  const ts = now();
  const requestId = randomUUID();
  const prPreference = input.prPreference ?? "draft_pr";

  db.prepare(
    `INSERT INTO mcp_tool_requests (
      id, requested_by_agent_id, request_source, tool_name, tool_description, reason,
      input_schema_json, output_contract_json, implementation_notes, target_files_json,
      pr_preference, status, human_review_required, human_reviewer_id, human_review_note,
      reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    requestId,
    input.requestedByAgentId,
    input.requestSource ?? "agent",
    toolName,
    input.toolDescription.trim(),
    input.reason.trim(),
    JSON.stringify(input.inputSchema ?? {}, null, 2),
    input.outputContract ? JSON.stringify(input.outputContract, null, 2) : null,
    input.implementationNotes?.trim() || null,
    input.targetFiles?.length ? JSON.stringify(input.targetFiles) : null,
    prPreference,
    "pending_human_review",
    1,
    null,
    null,
    null,
    ts,
    ts
  );

  const request = getRequestById(requestId)!;
  const prDraft = prPreference === "draft_pr" ? createPrDraftForRequest(request) : null;

  return {
    request,
    prDraft,
    humanReviewRequired: true,
    nextAction:
      "Request created. A human must review and approve this feature before implementation or merge."
  };
}

export function listMcpToolCreationRequests(input?: {
  status?: McpToolRequestStatus;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (input?.status) {
    where.push("status = ?");
    params.push(input.status);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
  const offset = Math.max(input?.offset ?? 0, 0);

  return db
    .prepare(
      `SELECT * FROM mcp_tool_requests
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as McpToolRequest[];
}

export function getMcpToolCreationRequest(requestId: string) {
  const request = getRequestById(requestId);
  if (!request) {
    return null;
  }

  return {
    request,
    prDraft: getPrDraftByRequestId(requestId)
  };
}

export function reviewMcpToolCreationRequest(input: {
  requestId: string;
  reviewerId: string;
  decision: "approve" | "reject";
  note?: string;
}) {
  const request = getRequestById(input.requestId);
  if (!request) {
    throw new Error("Tool creation request not found");
  }

  if (request.status !== "pending_human_review") {
    throw new Error(`Request already reviewed with status '${request.status}'`);
  }

  const status: McpToolRequestStatus = input.decision === "approve" ? "approved" : "rejected";
  const ts = now();

  db.prepare(
    `UPDATE mcp_tool_requests
     SET status = ?, human_reviewer_id = ?, human_review_note = ?, reviewed_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(status, input.reviewerId, input.note?.trim() || null, ts, ts, input.requestId);

  return getMcpToolCreationRequest(input.requestId)!;
}

export function markMcpToolRequestImplemented(input: {
  requestId: string;
  reviewerId: string;
  note?: string;
}) {
  const request = getRequestById(input.requestId);
  if (!request) {
    throw new Error("Tool creation request not found");
  }

  if (request.status !== "approved") {
    throw new Error("Only approved requests can be marked as implemented");
  }

  const ts = now();
  db.prepare(
    `UPDATE mcp_tool_requests
     SET status = 'implemented', human_reviewer_id = COALESCE(human_reviewer_id, ?),
         human_review_note = COALESCE(?, human_review_note), updated_at = ?
     WHERE id = ?`
  ).run(input.reviewerId, input.note?.trim() || null, ts, input.requestId);

  return getMcpToolCreationRequest(input.requestId)!;
}
