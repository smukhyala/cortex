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
    expect(result).toContain("Cortex memory sync update.");
    expect(result).toContain("Please update your memory/context");
  });
});

describe("pushToPoke", () => {
  it("sends correct payload on success", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ message: "OK" }),
    });

    const memories = [makeMemory("User is Sanjay", "identity")];
    const result = await pushToPoke(memories, "test-api-key", { fetchFn: mockFetch as any });

    expect(result.success).toBe(true);
    expect(result.endpoint).toBe("https://poke.com/api/v1/inbound/api-message");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://poke.com/api/v1/inbound/api-message");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer test-api-key");

    const body = JSON.parse(opts.body);
    expect(body.source).toBe("cortex");
    expect(body.user_approved_external_action).toBe(false);
    expect(body.message).toContain("Sanjay");
    expect(body.message).toContain("Please update your memory/context");
    expect(body.metadata.type).toBe("memory_sync");
    expect(body.metadata.includedMemoryCount).toBe(1);
  });

  it("uses the legacy webhook for pk-prefixed keys", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });

    const result = await pushToPoke(
      [makeMemory("User is Sanjay", "identity")],
      "pk_legacy",
      { fetchFn: mockFetch as any }
    );

    expect(result.success).toBe(true);
    expect(result.endpoint).toBe("https://poke.com/api/v1/inbound-sms/webhook");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://poke.com/api/v1/inbound-sms/webhook");
  });

  it("can send a targeted memory update message", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "",
    });

    await pushToPoke([makeMemory("User's favorite color is navy.", "preferences")], "key", {
      fetchFn: mockFetch as any,
      message: "Please remember this user memory: User's favorite color is navy.",
      metadata: { type: "memory_update", action: "create" },
      runId: "test-run",
    });

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.message).toBe("Please remember this user memory: User's favorite color is navy.");
    expect(body.run_id).toBe("test-run");
    expect(body.metadata.type).toBe("memory_update");
    expect(body.metadata.action).toBe("create");
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
