import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest
} from "@modelcontextprotocol/sdk/types.js";
import { toolDefs } from "./toolDefinitions";
import { handleToolCall } from "./toolHandlers";

export function createMcpServer(userId: string) {
  const server = new Server(
    {
      name: "skinbag-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...toolDefs] }));
  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => handleToolCall(request, userId));

  return server;
}
