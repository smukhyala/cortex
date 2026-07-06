import { describe, it, expect, vi } from "vitest";
import { formatPokeContext, pushToPoke } from "@/exporters/poke";

const makeMemory = (content: string, category: string, sensitive = false) => ({
  content,
  category,
  sensitive,
});

describe("formatPokeContext", () => {
  it("groups memories by category with labels", () => {
    const memories = [
      makeMemory("User's name is Sanjay", "identity"),
      makeMemory("User prefers TypeScript", "preferences"),
      makeMemory("User works at Acme", "education_career"),
    ];
    const result = formatPokeContext(memories);
    expect(result).toContain("Identity & Profile:");
    expect(result).toContain("- User's name is Sanjay");
    expect(result).toContain("Preferences & Style:");
    expect(result).toContain("- User prefers TypeScript");
  });

  it("excludes sensitive memories", () => {
    const memories = [
      makeMemory("User's name is Sanjay", "identity", false),
      makeMemory("User's SSN is 123-45-6789", "identity", true),
    ];
    const result = formatPokeContext(memories);
    expect(result).toContain("Sanjay");
    expect(result).not.toContain("SSN");
    expect(result).not.toContain("123-45-6789");
  });

  it("handles empty memories array", () => {
    const result = formatPokeContext([]);
    expect(result).toContain("Here is my current personal context:");
  });
});

describe("pushToPoke", () => {
  it("sends correct payload on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "OK" }),
    });

    const memories = [makeMemory("User is Sanjay", "identity")];
    const result = await pushToPoke(memories, "test-api-key", { fetchFn: mockFetch as any });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://poke.com/api/v1/inbound/api-message");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer test-api-key");

    const body = JSON.parse(opts.body);
    expect(body.message).toContain("Sanjay");
    expect(body.metadata.source).toBe("cortex");
  });

  it("handles 401 unauthorized", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const result = await pushToPoke([makeMemory("test", "identity")], "bad-key", { fetchFn: mockFetch as any });
    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
  });

  it("handles 500 server error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const result = await pushToPoke([makeMemory("test", "identity")], "key", { fetchFn: mockFetch as any });
    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });

  it("handles network errors", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await pushToPoke([makeMemory("test", "identity")], "key", { fetchFn: mockFetch as any });
    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("returns payload in dry-run mode without calling fetch", async () => {
    const mockFetch = vi.fn();
    const memories = [makeMemory("User is Sanjay", "identity")];

    const result = await pushToPoke(memories, "key", { dryRun: true, fetchFn: mockFetch as any });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Dry run");
    expect(result.payload).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
