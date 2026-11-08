"use node";

import { gunzipSync } from "node:zlib";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { v } from "convex/values";
import jpeg from "jpeg-js";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { COVER_FONT_FILES, RESVG_WASM_GZIP_BASE64 } from "./assets";
import { renderCoverSvg } from "./render";

const COVER_WIDTH = 1600;
const JPEG_QUALITY = 82;

let wasmReady: Promise<void> | undefined;

function ensureWasm(): Promise<void> {
  wasmReady ??= initWasm(
    gunzipSync(Buffer.from(RESVG_WASM_GZIP_BASE64, "base64")),
  );
  return wasmReady;
}

const fontBuffers = COVER_FONT_FILES.map((font) =>
  Buffer.from(font.base64, "base64"),
);

/**
 * Paints the title and author over the generated portrait art. Runs in Node
 * because resvg's wasm and jpeg-js need the Node runtime; the V8 action that
 * schedules it only passes storage ids.
 */
export const composeCover = internalAction({
  args: { storyId: v.id("stories"), artFileId: v.id("_storage") },
  handler: async (ctx, { storyId, artFileId }): Promise<Id<"_storage">> => {
    const story = await ctx.runQuery(internal.stories.getForCover, { storyId });
    if (!story) throw new Error("story not found");

    const blob = await ctx.storage.get(artFileId);
    if (!blob) throw new Error(`missing storage file ${artFileId}`);
    const art = new Uint8Array(await blob.arrayBuffer());

    await ensureWasm();
    const svg = renderCoverSvg({
      title: story.title,
      authorName: story.authorName,
      artHref: `data:${blob.type || "image/jpeg"};base64,${Buffer.from(
        art,
      ).toString("base64")}`,
    });

    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: COVER_WIDTH },
      font: { fontBuffers, defaultFontFamily: "Lexend" },
    });
    const rendered = resvg.render();
    const encoded = jpeg.encode(
      {
        data: rendered.pixels,
        width: rendered.width,
        height: rendered.height,
      },
      JPEG_QUALITY,
    );
    rendered.free();
    resvg.free();

    return await ctx.storage.store(
      new Blob([new Uint8Array(encoded.data)], { type: "image/jpeg" }),
    );
  },
});
