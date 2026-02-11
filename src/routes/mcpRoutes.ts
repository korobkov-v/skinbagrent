import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../mcp/server";
import { getDefaultUserId } from "../services/rentService";

type HostedMcpSession = {
  transport: StreamableHTTPServerTransport;
};

const sessions = new Map<string, HostedMcpSession>();

function getSessionId(req: Request): string | null {
  const value = req.header("mcp-session-id");
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function sendJsonRpcError(res: Response, httpStatus: number, code: number, message: string) {
  return res.status(httpStatus).json({
    jsonrpc: "2.0",
    error: {
      code,
      message
    },
    id: null
  });
}

async function createHostedSession(req: Request, res: Response) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, { transport });
    },
    onsessionclosed: (sessionId) => {
      sessions.delete(sessionId);
    }
  });

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
    }
  };
  transport.onerror = (error) => {
    console.error("Hosted MCP transport error", error);
  };

  const server = createMcpServer(getDefaultUserId());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

export const hostedMcpRouter = Router();

hostedMcpRouter.post("/mcp", async (req, res) => {
  const sessionId = getSessionId(req);

  try {
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return sendJsonRpcError(
          res,
          404,
          -32001,
          "MCP session not found. Re-initialize the connection."
        );
      }
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      return sendJsonRpcError(
        res,
        400,
        -32000,
        "No active MCP session. Send an initialize request first."
      );
    }

    await createHostedSession(req, res);
  } catch (error) {
    console.error("Hosted MCP POST handler failed", error);
    if (!res.headersSent) {
      return sendJsonRpcError(res, 500, -32603, "Internal MCP server error");
    }
  }
});

hostedMcpRouter.get("/mcp", async (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendJsonRpcError(res, 400, -32000, "Missing MCP session ID");
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return sendJsonRpcError(
      res,
      404,
      -32001,
      "MCP session not found. Re-initialize the connection."
    );
  }

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error("Hosted MCP GET handler failed", error);
    if (!res.headersSent) {
      return sendJsonRpcError(res, 500, -32603, "Internal MCP server error");
    }
  }
});

hostedMcpRouter.delete("/mcp", async (req, res) => {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    return sendJsonRpcError(res, 400, -32000, "Missing MCP session ID");
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return sendJsonRpcError(
      res,
      404,
      -32001,
      "MCP session not found. Re-initialize the connection."
    );
  }

  try {
    await session.transport.handleRequest(req, res);
  } catch (error) {
    console.error("Hosted MCP DELETE handler failed", error);
    if (!res.headersSent) {
      return sendJsonRpcError(res, 500, -32603, "Internal MCP server error");
    }
  }
});
