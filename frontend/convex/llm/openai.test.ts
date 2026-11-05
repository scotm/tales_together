import { describe, expect, it } from "vitest";
import { createOpenaiProvider } from "./openai";

function captureBody() {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  return { calls, fetchImpl };
}

describe("openai-compatible adapter", () => {
  it("sends the schema, the token cap and the key to /chat/completions", async () => {
    const { calls, fetchImpl } = captureBody();
    const provider = createOpenaiProvider({
      baseUrl: "http://host.docker.internal:5005/v1/",
      apiKey: "local-key",
      model: "gemma-4-e4b-it-4bit",
      fetchImpl,
    });

    const text = await provider.complete({
      system: "sys",
      user: "usr",
      jsonSchema: { type: "object" },
      maxTokens: 100,
    });

    expect(text).toBe('{"ok":true}');
    expect(provider.name).toBe("openai:gemma-4-e4b-it-4bit");

    const call = calls[0];
    if (!call) throw new Error("no request recorded");
    expect(call.url).toBe(
      "http://host.docker.internal:5005/v1/chat/completions",
    );
    expect(call.headers.get("authorization")).toBe("Bearer local-key");
    expect(call.body).toEqual({
      model: "gemma-4-e4b-it-4bit",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
      max_tokens: 100,
      response_format: {
        type: "json_schema",
        json_schema: { name: "reply", schema: { type: "object" } },
      },
    });
  });

  it("sends no schema and no auth header for free-form prose", async () => {
    const { calls, fetchImpl } = captureBody();
    const provider = createOpenaiProvider({
      baseUrl: "http://localhost:5005/v1",
      model: "gemma-4-e4b-it-4bit",
      fetchImpl,
    });

    await provider.complete({ system: "sys", user: "usr" });

    const call = calls[0];
    if (!call) throw new Error("no request recorded");
    expect(call.body).not.toHaveProperty("response_format");
    expect(call.headers.has("authorization")).toBe(false);
  });

  it("surfaces an HTTP error without leaking the key", async () => {
    const fetchImpl = (async () =>
      new Response("API key required", {
        status: 401,
      })) as unknown as typeof fetch;
    const provider = createOpenaiProvider({
      baseUrl: "http://localhost:5005/v1",
      apiKey: "local-key",
      model: "gemma-4-e4b-it-4bit",
      fetchImpl,
    });

    const failure = provider.complete({ system: "sys", user: "usr" });
    await expect(failure).rejects.toThrow(/401/);
    await expect(failure).rejects.not.toThrow(/local-key/);
  });
});
