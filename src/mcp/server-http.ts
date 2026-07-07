import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { createCortexMcpServer } from "@/mcp/cortex-server";

const PORT = parseInt(process.env.MCP_PORT || "3001", 10);
const transports = new Map<string, StreamableHTTPServerTransport | SSEServerTransport>();

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw);
}

function logMcpBody(body: unknown) {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as { id?: unknown; method?: unknown };
    console.log(`[mcp-http] body id=${record.id ?? "-"} method=${record.method ?? "-"}`);
  }
}

const httpServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const isMcpPath = url.pathname === "/mcp" || url.pathname.endsWith("/mcp");
  const isSsePath = url.pathname === "/sse" || url.pathname.endsWith("/sse");
  const isMessagesPath = url.pathname === "/messages" || url.pathname.endsWith("/messages");
  console.log(
    `[mcp-http] ${req.method} ${url.pathname} session=${req.headers["mcp-session-id"] || url.searchParams.get("sessionId") || "-"} ua=${req.headers["user-agent"] || "-"}`
  );

  let parsedBody: unknown;
  if (req.method === "POST") {
    try {
      parsedBody = await readJsonBody(req);
      logMcpBody(parsedBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mcp-http] failed to parse JSON body: ${message}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
  }

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "cortex", version: "0.1.0", status: "ok" }));
    return;
  }

  if ((isMcpPath || isSsePath) && req.method === "GET" && !req.headers["mcp-session-id"]) {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => transports.delete(transport.sessionId);
    const server = createCortexMcpServer({ defaultOrigin: "poke" });
    await server.connect(transport);
    return;
  }

  if (isMessagesPath && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!(transport instanceof SSEServerTransport)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
      return;
    }

    await transport.handlePostMessage(req, res, parsedBody);
    return;
  }

  if (!isMcpPath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    if (!(transport instanceof StreamableHTTPServerTransport)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session exists but uses a different MCP transport." }));
      return;
    }
    await transport.handleRequest(req, res, parsedBody);
    return;
  }

  if (req.method === "POST" && !sessionId) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    const server = createCortexMcpServer({ defaultOrigin: "poke" });
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
    if (transport.sessionId) transports.set(transport.sessionId, transport);
    return;
  }

  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "No valid session. Send a POST without mcp-session-id to initialize." }));
});

httpServer.listen(PORT, () => {
  console.log(`Cortex MCP HTTP server running on http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`\nTo connect from Poke, use this URL: http://localhost:${PORT}/mcp`);
});
