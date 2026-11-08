import type { TextProvider, TextRequest } from "./provider";
import { type RequestProgress, requestProviderJson } from "./request";

interface GeminiPart {
  text?: string;
  /** Models with thinking emit it as its own part; never parse it as output. */
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string };
}

/**
 * Gemini `generateContent`, written against the Gemini 3 request shape:
 * sampling parameters (`temperature`, `top_p`, `top_k`) are rejected by 3.x, and
 * reasoning is tuned with `thinkingLevel`, not `thinkingBudget`.
 *
 * Structured output is requested with `responseSchema`, which is a request, not
 * a guarantee — every reply is still parsed and validated by the caller.
 */
export function createGeminiProvider(options: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): TextProvider {
  return {
    name: `gemini:${options.model}`,
    async complete(request: TextRequest, progress?: RequestProgress) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        `${options.model}:generateContent`;

      const generationConfig: Record<string, unknown> = {};
      if (request.maxTokens) {
        generationConfig.maxOutputTokens = request.maxTokens;
      }
      if (request.jsonSchema) {
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseSchema = request.jsonSchema;
        // Cards and extractions want determinism, not deliberation. Low (not
        // "minimal", which 3.x Flash rejects) keeps structured calls cheap.
        generationConfig.thinkingConfig = { thinkingLevel: "low" };
      }

      const payload = await requestProviderJson<GeminiResponse>({
        provider: "gemini",
        url,
        fetchImpl: options.fetchImpl,
        progress,
        timeoutMs: request.timeoutMs,
        maxAttempts: request.maxAttempts,
        init: {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": options.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: "user", parts: [{ text: request.user }] }],
            generationConfig,
          }),
        },
      });
      const text = payload.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("");

      try {
        await progress?.onResult?.({
          usage: payload.usageMetadata
            ? {
                inputTokens: payload.usageMetadata.promptTokenCount,
                outputTokens: payload.usageMetadata.candidatesTokenCount,
                totalTokens: payload.usageMetadata.totalTokenCount,
              }
            : undefined,
          finishReason: payload.candidates?.[0]?.finishReason,
        });
      } catch {
        // Receipt collection must not change provider behaviour.
      }

      if (!text) {
        throw new Error("gemini returned no text");
      }
      return text;
    },
  };
}
