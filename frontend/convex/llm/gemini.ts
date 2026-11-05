import type { TextProvider, TextRequest } from "./provider";

interface GeminiPart {
  text?: string;
  /** Models with thinking emit it as its own part; never parse it as output. */
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
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
  const doFetch = options.fetchImpl ?? fetch;

  return {
    name: `gemini:${options.model}`,
    async complete(request: TextRequest) {
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

      const response = await doFetch(url, {
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
      });

      if (!response.ok) {
        // Never include the key. The body carries the provider's own message.
        const body = await response.text();
        throw new Error(`gemini ${response.status}: ${body.slice(0, 300)}`);
      }

      const payload = (await response.json()) as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.filter((part) => !part.thought)
        .map((part) => part.text ?? "")
        .join("");

      if (!text) {
        throw new Error(
          `gemini returned no text: ${payload.error?.message ?? "unknown"}`,
        );
      }
      return text;
    },
  };
}
