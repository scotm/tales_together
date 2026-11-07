import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { getImageGenerator } from "./llm/imageProvider";

/** CLI-only quality/cost sampling; never mutates a family's book or provider setting. */
export const generate = internalAction({
  args: {
    model: v.string(),
    prompt: v.string(),
    aspectRatio: v.union(v.literal("4:3"), v.literal("2:3")),
  },
  handler: async (
    ctx,
    { model, prompt, aspectRatio },
  ): Promise<{
    fileId: Id<"_storage">;
    url: string | null;
    elapsedMs: number;
    requestId: string | null;
    costMicroUsd: number | null;
    servedBy: string | null;
  }> => {
    const generate = getImageGenerator({
      SURPLUS_API_KEY: process.env.SURPLUS_API_KEY,
      SURPLUS_MIN_DISCOUNT_PCT: process.env.SURPLUS_MIN_DISCOUNT_PCT,
      IMAGE_PROVIDER: "surplus",
      SURPLUS_IMAGE_MODEL: model,
    });
    if (!generate) throw new Error("image sampling is disabled");
    const start = Date.now();
    const image = await generate({ prompt, aspectRatio });
    const elapsedMs = Date.now() - start;
    const original = await ctx.storage.store(
      new Blob([image.bytes], {
        type: image.contentType,
      }),
    );
    try {
      const fileId = await ctx.runAction(internal.mediaNode.recompress, {
        fileId: original,
      });
      return {
        fileId,
        url: await ctx.storage.getUrl(fileId),
        elapsedMs,
        requestId: image.requestId ?? null,
        costMicroUsd: image.costMicroUsd ?? null,
        servedBy: image.servedBy ?? null,
      };
    } finally {
      await ctx.storage.delete(original);
    }
  },
});
