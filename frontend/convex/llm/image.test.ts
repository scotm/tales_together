import { describe, expect, it } from "vitest";
import { coverRequest, illustrationRequest } from "../media";
import { createGeminiImageGenerator, decodeBase64 } from "./image";

describe("base64 decode", () => {
  it("decodes known bytes", () => {
    // "hello"
    expect(Array.from(decodeBase64("aGVsbG8="))).toEqual([
      104, 101, 108, 108, 111,
    ]);
  });

  it("decodes without padding and ignores newlines", () => {
    // "hi"
    expect(Array.from(decodeBase64("aGk"))).toEqual([104, 105]);
    expect(Array.from(decodeBase64("aGVs\nbG8="))).toEqual([
      104, 101, 108, 108, 111,
    ]);
  });
});

function capture() {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { mimeType: "image/jpeg", data: "aGVsbG8=" },
                },
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

describe("gemini image generator", () => {
  it("asks for the pinned model, 4:3 and returns bytes", async () => {
    const { calls, fetchImpl } = capture();
    const generate = createGeminiImageGenerator({
      apiKey: "test-key",
      model: "gemini-3.1-flash-image",
      fetchImpl,
    });

    const image = await generate({ prompt: "a girl and a kite" });

    expect(image.contentType).toBe("image/jpeg");
    expect(Array.from(image.bytes)).toEqual([104, 101, 108, 108, 111]);

    const call = calls[0];
    if (!call) throw new Error("no request recorded");
    expect(call.url).toContain(
      "/models/gemini-3.1-flash-image:generateContent",
    );
    expect(call.headers.get("x-goog-api-key")).toBe("test-key");
    expect(call.body).toEqual({
      contents: [{ role: "user", parts: [{ text: "a girl and a kite" }] }],
      generationConfig: { imageConfig: { aspectRatio: "4:3" } },
    });
  });

  it("surfaces an HTTP error without leaking the key", async () => {
    const fetchImpl = (async () =>
      new Response("quota exceeded", {
        status: 429,
      })) as unknown as typeof fetch;
    const generate = createGeminiImageGenerator({
      apiKey: "secret-key",
      model: "gemini-3.1-flash-image",
      fetchImpl,
    });

    const failure = generate({ prompt: "x" });
    await expect(failure).rejects.toThrow(/429/);
    await expect(failure).rejects.not.toThrow(/secret-key/);
  });
});

describe("image prompts", () => {
  it("locks the art style and forbids text", () => {
    const prompt = illustrationRequest("A girl on a pier.", "watercolour");
    expect(prompt).toContain("A girl on a pier.");
    expect(prompt).toContain("Style: watercolour.");
    expect(prompt).toContain("no text");
  });

  it("describes the hero on the cover, not just their name", () => {
    const prompt = coverRequest({
      title: "The Windy Kite",
      setting: "A seaside town",
      heroVisualDescription: "a girl in a yellow raincoat",
      artStyle: "watercolour",
    });
    expect(prompt).toContain("The Windy Kite");
    expect(prompt).toContain("a girl in a yellow raincoat");
  });
});
