import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config";
import { initializeDatabase } from "./db/init";
import { createMcpServer } from "./mcp/server";
import { getDefaultUserId } from "./services/rentService";

initializeDatabase();

async function main() {
  const server = createMcpServer(getDefaultUserId());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${config.MCP_AGENT_NAME} MCP server started`);
}

main().catch((error) => {
  console.error("Failed to start MCP server", error);
  process.exit(1);
});
