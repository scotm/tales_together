import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "./gemini";

function captureBody() {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                { text: "thinking out loud", thought: true },
                { text: '{"ok":true}' },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

describe("gemini adapter", () => {
  it("sends the pinned model, no sampling params, and low thinking for JSON", async () => {
    const { calls, fetchImpl } = captureBody();
    const provider = createGeminiProvider({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      fetchImpl,
    });

    const text = await provider.complete({
      system: "sys",
      user: "usr",
      jsonSchema: { type: "object" },
      maxTokens: 100,
    });

    expect(text).toBe('{"ok":true}');
    expect(calls[0]?.url).toContain("/models/gemini-3.8-flash:generateContent");

    const recorded = calls[0]?.body;
    if (!recorded) throw new Error("no request recorded");
    const config = (recorded as { generationConfig: Record<string, unknown> })
      .generationConfig;
    // Gemini 3.x rejects temperature/top_p/top_k outright.
    expect(config).not.toHaveProperty("temperature");
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "low" });
    expect(config.responseMimeType).toBe("application/json");
  });

  it("leaves thinking at the model default for free-form prose", async () => {
    const { calls, fetchImpl } = captureBody();
    const provider = createGeminiProvider({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      fetchImpl,
    });

    await provider.complete({ system: "sys", user: "usr" });

    const recorded = calls[0]?.body;
    if (!recorded) throw new Error("no request recorded");
    const config = (recorded as { generationConfig: Record<string, unknown> })
      .generationConfig;
    expect(config).not.toHaveProperty("thinkingConfig");
    expect(config).not.toHaveProperty("responseSchema");
  });

  it("surfaces an API error without leaking the key", async () => {
    const fetchImpl = (async () =>
      new Response("model not found", {
        status: 404,
      })) as unknown as typeof fetch;
    const provider = createGeminiProvider({
      apiKey: "super-secret-key",
      model: "gemini-9-flash",
      fetchImpl,
    });

    await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrow(
      /gemini 404: request failed/,
    );
  });
});
