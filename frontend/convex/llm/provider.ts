import {
  GEMINI_FAST_MODEL,
  GEMINI_PROSE_MODEL,
  LOCAL_LLM_MODEL,
  LOCAL_LLM_URL,
} from "../lib/config";
import { createGeminiProvider } from "./gemini";
import { createOpenaiProvider } from "./openai";
import type { RequestProgress } from "./request";

export interface TextRequest {
  system: string;
  user: string;
  /** JSON Schema for structured output. Omitted for free-form prose. */
  jsonSchema?: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
  maxAttempts?: number;
}

export type ProviderPurpose = "prose" | "structured";

export interface TextProvider {
  readonly name: string;
  complete(request: TextRequest, progress?: RequestProgress): Promise<string>;
}

export interface RecordedCall {
  request: TextRequest;
}

/**
 * Test double. Replays `replies` in order and records every request, so a test
 * can assert on the prompt without a network call or an API key.
 */
export function createFakeProvider(replies: string[]): {
  provider: TextProvider;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let cursor = 0;

  return {
    calls,
    provider: {
      name: "fake",
      async complete(request) {
        calls.push({ request });
        const reply = replies[cursor];
        cursor += 1;
        if (reply === undefined) {
          // Shotgunning empty strings into the database is worse than failing.
          throw new Error("fake provider ran out of replies");
        }
        return reply;
      },
    },
  };
}

/**
 * Gemini adapters. `structured` uses the cheap Flash-Lite: cards and
 * extractions need shape, not prose. Both model ids are pinned in config.ts.
 *
 * If LOCAL_LLM_URL is set, every purpose goes to the local oMLX server instead:
 * one small model, no spend, for development.
 */
export function getTextProvider(
  purpose: ProviderPurpose = "prose",
): TextProvider {
  if (LOCAL_LLM_URL) {
    return createOpenaiProvider({
      baseUrl: LOCAL_LLM_URL,
      apiKey: process.env.LOCAL_LLM_API_KEY,
      model: LOCAL_LLM_MODEL,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set on this Convex deployment: npx convex env set GEMINI_API_KEY …",
    );
  }
  return createGeminiProvider({
    apiKey,
    model: purpose === "structured" ? GEMINI_FAST_MODEL : GEMINI_PROSE_MODEL,
  });
}
