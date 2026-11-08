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
import type * as cover_assets from "../cover/assets.js";
import type * as cover_rasterize from "../cover/rasterize.js";
import type * as cover_render from "../cover/render.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as epub_assets from "../epub/assets.js";
import type * as epub_build from "../epub/build.js";
import type * as epub_templates from "../epub/templates.js";
import type * as exportJobs from "../exportJobs.js";
import type * as fixtures_legacyCatalog from "../fixtures/legacyCatalog.js";
import type * as imageSamples from "../imageSamples.js";
import type * as lib_catalogValidators from "../lib/catalogValidators.js";
import type * as lib_config from "../lib/config.js";
import type * as lib_diagnostics from "../lib/diagnostics.js";
import type * as lib_resolveSetup from "../lib/resolveSetup.js";
import type * as llm_beatCards from "../llm/beatCards.js";
import type * as llm_compressImage from "../llm/compressImage.js";
import type * as llm_extraction from "../llm/extraction.js";
import type * as llm_gemini from "../llm/gemini.js";
import type * as llm_image from "../llm/image.js";
import type * as llm_imageProvider from "../llm/imageProvider.js";
import type * as llm_jsonReply from "../llm/jsonReply.js";
import type * as llm_jsonSchemas from "../llm/jsonSchemas.js";
import type * as llm_moderation from "../llm/moderation.js";
import type * as llm_openai from "../llm/openai.js";
import type * as llm_promptMatrices from "../llm/promptMatrices.js";
import type * as llm_prompts from "../llm/prompts.js";
import type * as llm_proseLint from "../llm/proseLint.js";
import type * as llm_provider from "../llm/provider.js";
import type * as llm_request from "../llm/request.js";
import type * as llm_surplusImage from "../llm/surplusImage.js";
import type * as media from "../media.js";
import type * as mediaNode from "../mediaNode.js";
import type * as migrations from "../migrations.js";
import type * as stories from "../stories.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  catalog: typeof catalog;
  chapters: typeof chapters;
  "cover/assets": typeof cover_assets;
  "cover/rasterize": typeof cover_rasterize;
  "cover/render": typeof cover_render;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  "epub/assets": typeof epub_assets;
  "epub/build": typeof epub_build;
  "epub/templates": typeof epub_templates;
  exportJobs: typeof exportJobs;
  "fixtures/legacyCatalog": typeof fixtures_legacyCatalog;
  imageSamples: typeof imageSamples;
  "lib/catalogValidators": typeof lib_catalogValidators;
  "lib/config": typeof lib_config;
  "lib/diagnostics": typeof lib_diagnostics;
  "lib/resolveSetup": typeof lib_resolveSetup;
  "llm/beatCards": typeof llm_beatCards;
  "llm/compressImage": typeof llm_compressImage;
  "llm/extraction": typeof llm_extraction;
  "llm/gemini": typeof llm_gemini;
  "llm/image": typeof llm_image;
  "llm/imageProvider": typeof llm_imageProvider;
  "llm/jsonReply": typeof llm_jsonReply;
  "llm/jsonSchemas": typeof llm_jsonSchemas;
  "llm/moderation": typeof llm_moderation;
  "llm/openai": typeof llm_openai;
  "llm/promptMatrices": typeof llm_promptMatrices;
  "llm/prompts": typeof llm_prompts;
  "llm/proseLint": typeof llm_proseLint;
  "llm/provider": typeof llm_provider;
  "llm/request": typeof llm_request;
  "llm/surplusImage": typeof llm_surplusImage;
  media: typeof media;
  mediaNode: typeof mediaNode;
  migrations: typeof migrations;
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
