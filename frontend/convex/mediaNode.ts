"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { recompressImage } from "./llm/compressImage";

// `jpeg-js` needs Node's Buffer, so compression lives here and the V8 actions
// call across. `sharp` would be faster but its native binary cannot load in the
// Convex runtime at all.
async function shrink(
  ctx: {
    storage: {
      get: (id: Id<"_storage">) => Promise<Blob | null>;
      store: (blob: Blob) => Promise<Id<"_storage">>;
    };
  },
  fileId: Id<"_storage">,
): Promise<Id<"_storage">> {
  const blob = await ctx.storage.get(fileId);
  if (!blob) throw new Error(`no stored file ${fileId}`);

  const smaller = recompressImage(
    new Uint8Array(await blob.arrayBuffer()),
  ).bytes;
  return await ctx.storage.store(new Blob([smaller], { type: "image/jpeg" }));
}

/** Returns a smaller copy of one stored image. */
export const recompress = internalAction({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, { fileId }): Promise<Id<"_storage">> =>
    shrink(ctx, fileId),
});

/**
 * Maintenance pass for images stored before compression existed. Each old blob
 * is deleted once the chapter or cover points at its replacement.
 */
export const recompressAll = internalAction({
  args: {},
  handler: async (ctx): Promise<number> => {
    const images = await ctx.runQuery(internal.media.listImages, {});
    let total = 0;

    for (const image of images) {
      const fileId = await shrink(ctx, image.fileId);
      if ("chapterId" in image) {
        await ctx.runMutation(internal.chapters.setIllustration, {
          chapterId: image.chapterId,
          fileId,
        });
      } else {
        await ctx.runMutation(internal.stories.setCover, {
          storyId: image.storyId,
          fileId,
        });
      }
      await ctx.storage.delete(image.fileId);
      total += 1;
    }
    return total;
  },
});
