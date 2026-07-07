import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getContextBundleMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/context", () => ({
  getContextBundle: getContextBundleMock,
}));

import { GET } from "@/app/api/context/route";

function request(url: string) {
  return new NextRequest(url);
}

describe("GET /api/context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContextBundleMock.mockResolvedValue({
      version: "v1",
      generatedAt: "2026-07-07T00:00:00.000Z",
      destination: "poke",
      memoryCount: 1,
      omittedSensitiveCount: 0,
      groups: [],
      markdown: "## Preferences\n- User likes TypeScript",
      prompt: "Use this Cortex context.",
    });
  });

  it("returns the JSON context bundle by default", async () => {
    const response = await GET(request("http://localhost/api/context?destination=poke&maxItems=10"));
    const body = await response.json();

    expect(getContextBundleMock).toHaveBeenCalledWith({
      destination: "poke",
      sourceId: undefined,
      includeSensitive: false,
      maxItems: 10,
    });
    expect(body).toMatchObject({ version: "v1", memoryCount: 1 });
  });

  it("returns prompt text when requested", async () => {
    const response = await GET(request("http://localhost/api/context?format=prompt"));
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(text).toBe("Use this Cortex context.");
  });

  it("returns markdown when requested", async () => {
    const response = await GET(request("http://localhost/api/context?format=markdown"));
    const text = await response.text();

    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(text).toContain("User likes TypeScript");
  });
});
