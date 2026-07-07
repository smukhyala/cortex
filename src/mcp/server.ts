import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCortexMcpServer } from "@/mcp/cortex-server";

async function main() {
  const server = createCortexMcpServer({ defaultOrigin: "claude" });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cortex MCP server running on stdio");
}

main().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
