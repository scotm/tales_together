"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  createDiagnostics,
  diagnosticContext,
  operationIdFor,
} from "./lib/diagnostics";
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
): Promise<{
  fileId: Id<"_storage">;
  inputBytes: number;
  outputBytes: number;
  width: number;
  height: number;
}> {
  const blob = await ctx.storage.get(fileId);
  if (!blob) throw new Error(`no stored file ${fileId}`);

  const compressed = recompressImage(new Uint8Array(await blob.arrayBuffer()));
  const stored = await ctx.storage.store(
    new Blob([compressed.bytes], { type: "image/jpeg" }),
  );
  return {
    fileId: stored,
    inputBytes: blob.size,
    outputBytes: compressed.bytes.byteLength,
    width: compressed.width,
    height: compressed.height,
  };
}

/** Returns a smaller copy of one stored image. */
export const recompress = internalAction({
  args: {
    fileId: v.id("_storage"),
    diagnostics: v.optional(diagnosticContext),
  },
  handler: async (ctx, { fileId, diagnostics }): Promise<Id<"_storage">> => {
    const diag = createDiagnostics(ctx, {
      name: "compression",
      source: "node",
      traceId: diagnostics?.traceId ?? "compression",
      operationId:
        diagnostics?.operationId ?? operationIdFor("compress", String(fileId)),
      parentOperationId: diagnostics?.parentOperationId,
      runId: diagnostics?.runId,
      scheduledAt: diagnostics?.scheduledAt,
      storyId: diagnostics?.storyId,
      chapterId: diagnostics?.chapterId,
      purpose: "compression",
    });
    await diag.start();
    try {
      const result = await shrink(ctx, fileId);
      await diag.record("media.compressed", {
        status: "succeeded",
        stage: "jpeg_reencode",
        bytesBefore: result.inputBytes,
        bytesAfter: result.outputBytes,
        message:
          `input_bytes=${result.inputBytes} output_bytes=${result.outputBytes} ` +
          `width=${result.width} height=${result.height}`,
      });
      await diag.finish("succeeded");
      return result.fileId;
    } catch (cause) {
      await diag.finish("failed", cause);
      throw cause;
    }
  },
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
      const { fileId } = await shrink(ctx, image.fileId);
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
