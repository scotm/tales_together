import { type RequestProgress, requestProviderJson } from "./request";

interface InlineData {
  mimeType?: string;
  data?: string;
}

interface ImageResponse {
  candidates?: { content?: { parts?: { inlineData?: InlineData }[] } }[];
  error?: { message?: string };
}

export interface GeneratedImage {
  /** Backed by a plain ArrayBuffer so it can be stored as a Blob. */
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
  /** Provider receipt id, when available, for checking the settled charge. */
  requestId?: string;
  costMicroUsd?: number;
  servedBy?: string;
}

export interface ImageRequest {
  prompt: string;
  aspectRatio?: string;
  progress?: RequestProgress;
}

export type ImageGenerator = (request: ImageRequest) => Promise<GeneratedImage>;

/**
 * Standard base64 decoder. Convex's V8 runtime is not guaranteed to have
 * `atob` or `Buffer`, and this is cheaper than discovering that at runtime.
 */
export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i += 1) {
    lookup.set(alphabet[i] as string, i);
  }

  const clean = value.replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((clean.length * 3) / 4 - padding);

  let cursor = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const chunk =
      (lookup.get(clean[i] as string) ?? 0) * 262144 +
      (lookup.get(clean[i + 1] as string) ?? 0) * 4096 +
      (lookup.get(clean[i + 2] as string) ?? 0) * 64 +
      (lookup.get(clean[i + 3] as string) ?? 0);

    for (let shift = 16; shift >= 0 && cursor < bytes.length; shift -= 8) {
      bytes[cursor] = (chunk >> shift) & 255;
      cursor += 1;
    }
  }
  return bytes;
}

/**
 * Gemini image generation. Returns bytes rather than a URL because Convex
 * actions store their own blobs; a provider URL would be a temporary lease.
 */
export function createGeminiImageGenerator(options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): ImageGenerator {
  return async ({ prompt, aspectRatio, progress }) => {
    const payload = await requestProviderJson<ImageResponse>({
      provider: "image",
      url:
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        `${options.model}:generateContent`,
      fetchImpl: options.fetchImpl,
      progress,
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": options.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            imageConfig: { aspectRatio: aspectRatio ?? "4:3" },
          },
        }),
      },
    });
    const inline = payload.candidates?.[0]?.content?.parts?.find(
      (part) => part.inlineData?.data,
    )?.inlineData;

    if (!inline?.data) {
      throw new Error("image returned no bytes");
    }

    return {
      bytes: decodeBase64(inline.data),
      contentType: inline.mimeType ?? "image/jpeg",
    };
  };
}
