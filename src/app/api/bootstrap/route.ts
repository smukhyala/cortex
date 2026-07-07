import { NextResponse } from "next/server";
import { formatBootstrapInstructions, getClaudeBootstrapPaths, writeAllClaudeBootstraps } from "@/exporters/bootstrap";

export async function GET() {
  const port = process.env.MCP_PORT || "3001";
  const localMcpUrl = `http://localhost:${port}/mcp`;
  const publicMcpUrl = process.env.CORTEX_PUBLIC_MCP_URL || null;

  return NextResponse.json({
    instructions: formatBootstrapInstructions(),
    paths: await getClaudeBootstrapPaths(),
    claudeAi: {
      connectorName: "Cortex",
      localMcpUrl,
      publicMcpUrl,
      configured: !!publicMcpUrl,
      setupInstructions: [
        "Start the Cortex HTTP MCP server with `npm run mcp:http`.",
        "Expose it over HTTPS with a tunnel or hosted deployment, then set CORTEX_PUBLIC_MCP_URL to the public /mcp URL.",
        "In Claude.ai, open Customize > Connectors > Add custom connector.",
        "Use connector name `Cortex` and the public MCP URL.",
        "After connecting, ask Claude.ai to call `cortex_get_context` for personalized or memory-sensitive questions.",
      ],
    },
  });
}

export async function POST() {
  const results = await writeAllClaudeBootstraps();
  return NextResponse.json({
    success: results.every((result) => result.installed),
    results,
    instructions: formatBootstrapInstructions(),
  });
}
