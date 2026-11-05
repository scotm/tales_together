/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as catalog from "../catalog.js";
import type * as chapters from "../chapters.js";
import type * as lib_config from "../lib/config.js";
import type * as llm_beatCards from "../llm/beatCards.js";
import type * as llm_extraction from "../llm/extraction.js";
import type * as llm_gemini from "../llm/gemini.js";
import type * as llm_jsonReply from "../llm/jsonReply.js";
import type * as llm_jsonSchemas from "../llm/jsonSchemas.js";
import type * as llm_moderation from "../llm/moderation.js";
import type * as llm_openai from "../llm/openai.js";
import type * as llm_promptMatrices from "../llm/promptMatrices.js";
import type * as llm_prompts from "../llm/prompts.js";
import type * as llm_proseLint from "../llm/proseLint.js";
import type * as llm_provider from "../llm/provider.js";
import type * as stories from "../stories.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  catalog: typeof catalog;
  chapters: typeof chapters;
  "lib/config": typeof lib_config;
  "llm/beatCards": typeof llm_beatCards;
  "llm/extraction": typeof llm_extraction;
  "llm/gemini": typeof llm_gemini;
  "llm/jsonReply": typeof llm_jsonReply;
  "llm/jsonSchemas": typeof llm_jsonSchemas;
  "llm/moderation": typeof llm_moderation;
  "llm/openai": typeof llm_openai;
  "llm/promptMatrices": typeof llm_promptMatrices;
  "llm/prompts": typeof llm_prompts;
  "llm/proseLint": typeof llm_proseLint;
  "llm/provider": typeof llm_provider;
  stories: typeof stories;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
