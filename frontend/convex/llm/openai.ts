import type { TextProvider, TextRequest } from "./provider";
import { type RequestProgress, requestProviderJson } from "./request";

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

/**
 * OpenAI-compatible `/chat/completions`, for the local oMLX server during
 * development. Structured output is requested with a JSON Schema, which is a
 * request, not a guarantee — every reply is still parsed and validated by the
 * caller.
 */
export function createOpenaiProvider(options: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
}): TextProvider {
  return {
    name: `openai:${options.model}`,
    async complete(request: TextRequest, progress?: RequestProgress) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (options.apiKey) {
        headers.authorization = `Bearer ${options.apiKey}`;
      }

      const payload = await requestProviderJson<ChatResponse>({
        provider: "openai-compatible",
        url: `${options.baseUrl.replace(/\/$/, "")}/chat/completions`,
        fetchImpl: options.fetchImpl,
        progress,
        init: {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            max_tokens: request.maxTokens,
            response_format: request.jsonSchema && {
              type: "json_schema",
              json_schema: { name: "reply", schema: request.jsonSchema },
            },
          }),
        },
      });
      const text = payload.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error("openai-compatible server returned no text");
      }
      return text;
    },
  };
}
