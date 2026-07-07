import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const orchestratorRunMock = vi.hoisted(() => vi.fn());

vi.mock("@/pipeline/agents/poke-webhook-orchestrator", () => ({
  PokeWebhookOrchestrator: vi.fn(function MockPokeWebhookOrchestrator() {
    return {
      run: orchestratorRunMock,
    };
  }),
}));

import { POST } from "@/app/api/webhooks/poke-memory/route";

function makeRequest(payload: unknown, headers?: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/webhooks/poke-memory", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

describe("POST /api/webhooks/poke-memory", () => {
  const originalSecret = process.env.POKE_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.POKE_WEBHOOK_SECRET;
    orchestratorRunMock.mockResolvedValue({
      ingested: true,
      factsExtracted: 1,
      textProcessed: "User: It's green",
      eventType: "message.created",
      conversationId: "thread-1",
    });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.POKE_WEBHOOK_SECRET;
    } else {
      process.env.POKE_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("accepts webhook payloads when no secret is configured", async () => {
    const response = await POST(makeRequest({ message: "It's green" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ingested: true, factsExtracted: 1 });
  });

  it("rejects requests without the configured secret", async () => {
    process.env.POKE_WEBHOOK_SECRET = "test-secret";

    const response = await POST(makeRequest({ message: "It's green" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("accepts the configured secret in a bearer token", async () => {
    process.env.POKE_WEBHOOK_SECRET = "test-secret";

    const response = await POST(
      makeRequest({ message: "It's green" }, { authorization: "Bearer test-secret" })
    );

    expect(response.status).toBe(201);
  });
});
