import { ConvexError, v } from "convex/values";
import JSZip from "jszip";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action, internalAction } from "../_generated/server";
import {
  createDiagnostics,
  type DiagnosticContext,
  diagnosticContext,
  operationIdFor,
} from "../lib/diagnostics";
import { decodeBase64 } from "../llm/image";
import { FONT_FILES } from "./assets";
import {
  type ManifestItem,
  renderChapter,
  renderContainer,
  renderContentOpf,
  renderCover,
  renderNav,
  renderTitlepage,
  STORYBOOK_CSS,
} from "./templates";

// One fixed timestamp for every entry so two builds of a story are identical.
const FIXED_DATE = new Date("2020-01-01T00:00:00Z");

async function runBuild(
  ctx: ActionCtx,
  storyId: Id<"stories">,
  runId: string,
): Promise<{
  fileId: Id<"_storage">;
  bytes: number;
  imageCount: number;
  chapterCount: number;
}> {
  const { story, chapters } = await ctx.runQuery(
    internal.stories.getForExport,
    { storyId },
  );
  if (chapters.length === 0) throw new Error("no chapters to export");

  const ordered = [...chapters].sort((a, b) => a.index - b.index);
  const zip = new JSZip();
  const add = (path: string, data: string | Uint8Array, store = false) => {
    zip.file(path, data, {
      date: FIXED_DATE,
      compression: store ? "STORE" : "DEFLATE",
      createFolders: false,
    });
  };
  const read = async (id: Id<"_storage">, kind: string) => {
    const blob = await ctx.storage.get(id);
    if (!blob) {
      const error = new Error(`missing storage file ${id}`);
      // The category travels with the error; the file id never reaches a log.
      (error as Error & { missingAsset?: string }).missingAsset = kind;
      throw error;
    }
    return new Uint8Array(await blob.arrayBuffer());
  };

  // EPUB byte order: mimetype first, stored, no trailing newline.
  add("mimetype", "application/epub+zip", true);
  add("META-INF/container.xml", renderContainer());
  add("OEBPS/css/storybook.css", STORYBOOK_CSS);

  const manifest: ManifestItem[] = [];
  const spine = ["titlepage"];

  for (const font of FONT_FILES) {
    add(`OEBPS/fonts/${font.filename}`, decodeBase64(font.base64));
    manifest.push({
      id: font.id,
      href: `fonts/${font.filename}`,
      mediaType: "font/woff2",
    });
  }

  if (story.coverFileId) {
    add("OEBPS/images/cover.jpg", await read(story.coverFileId, "cover"));
    add("OEBPS/text/cover.xhtml", renderCover(story.title));
    spine.unshift("cover");
    manifest.push({
      id: "cover",
      href: "text/cover.xhtml",
      mediaType: "application/xhtml+xml",
      properties: "svg",
    });
    manifest.push({
      id: "cover-image",
      href: "images/cover.jpg",
      mediaType: "image/jpeg",
      properties: "cover-image",
    });
  }

  for (const chapter of ordered) {
    const hasImage = Boolean(chapter.illustrationFileId);
    if (chapter.illustrationFileId) {
      add(
        `OEBPS/images/ch_${chapter.index}.jpg`,
        await read(chapter.illustrationFileId, `chapter_${chapter.index}`),
      );
      manifest.push({
        id: `img-ch-${chapter.index}`,
        href: `images/ch_${chapter.index}.jpg`,
        mediaType: "image/jpeg",
      });
    }

    add(
      `OEBPS/text/chapter_${chapter.index}.xhtml`,
      renderChapter({
        index: chapter.index,
        title: chapter.title,
        paragraphs: chapter.paragraphs,
        hasImage,
      }),
    );
    manifest.push({
      id: `chapter-${chapter.index}`,
      href: `text/chapter_${chapter.index}.xhtml`,
      mediaType: "application/xhtml+xml",
    });
    spine.push(`chapter-${chapter.index}`);
  }

  add(
    "OEBPS/text/titlepage.xhtml",
    renderTitlepage({
      title: story.title,
      setting: story.worldState.setting,
      authorName: story.authorName,
    }),
  );
  add("OEBPS/nav.xhtml", renderNav(ordered, Boolean(story.coverFileId)));
  add(
    "OEBPS/content.opf",
    renderContentOpf({
      storyId: story._id,
      title: story.title,
      creator: story.authorName,
      createdAt: story.createdAt,
      manifest,
      spine,
    }),
  );

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    mimeType: "application/epub+zip",
  });
  // JSZip types its output buffer loosely; the bytes are a plain ArrayBuffer.
  const fileId = await ctx.storage.store(
    new Blob([bytes as unknown as BlobPart], {
      type: "application/epub+zip",
    }),
  );
  try {
    await ctx.runMutation(internal.exportJobs.complete, {
      storyId,
      runId,
      fileId,
    });
  } catch (error) {
    await ctx.storage.delete(fileId);
    throw error;
  }
  return {
    fileId,
    bytes: bytes.byteLength,
    imageCount: manifest.filter((item) => item.mediaType === "image/jpeg")
      .length,
    chapterCount: ordered.length,
  };
}

async function trackedBuild(
  ctx: ActionCtx,
  storyId: Id<"stories">,
  existingRunId?: string,
  context?: DiagnosticContext,
): Promise<Id<"_storage">> {
  const runId =
    existingRunId ??
    (await ctx.runMutation(internal.exportJobs.begin, {
      storyId,
      stage: "BUILDING",
    }));
  if (!runId) throw new ConvexError("Your book is already being prepared.");

  const diag = createDiagnostics(ctx, {
    name: "export",
    traceId: context?.traceId ?? runId,
    operationId: context?.operationId ?? operationIdFor("export", runId),
    parentOperationId: context?.parentOperationId,
    runId,
    scheduledAt: context?.scheduledAt,
    storyId,
    purpose: "export",
  });
  await diag.start();

  try {
    await diag.record("export.stage", {
      status: "succeeded",
      stage: "claim",
    });
    await ctx.runMutation(internal.exportJobs.building, { storyId, runId });
    await diag.record("export.stage", {
      status: "succeeded",
      stage: "building",
    });
    const result = await runBuild(ctx, storyId, runId);
    await diag.record("export.built", {
      status: "succeeded",
      stage: "archive",
      message:
        `archive_bytes=${result.bytes} images=${result.imageCount} ` +
        `chapters=${result.chapterCount}`,
    });
    await diag.record("export.stage", {
      status: "succeeded",
      stage: "stored",
    });
    await diag.finish("succeeded");
    return result.fileId;
  } catch (cause) {
    const superseded =
      cause instanceof Error && cause.message.includes("no longer active");
    const missing = (cause as Error & { missingAsset?: string })?.missingAsset;
    if (missing) {
      await diag.record("export.failed", {
        level: "error",
        status: "failed",
        stage: "archive",
        errorCode: "EXPORT_MISSING_ASSET",
        message: `missing_assets=${missing}`,
      });
    }
    await diag.finish(superseded ? "superseded" : "failed", cause);
    if (!superseded) {
      await ctx.runMutation(internal.exportJobs.fail, { storyId, runId });
    }
    throw new ConvexError(
      "We couldn't prepare your download. Your chapters are saved. Try again.",
    );
  }
}

export const buildEpub = action({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }): Promise<Id<"_storage">> =>
    trackedBuild(ctx, storyId),
});

/** Scheduler target: only internal functions may be scheduled. */
export const buildEpubInternal = internalAction({
  args: {
    storyId: v.id("stories"),
    runId: v.optional(v.string()),
    diagnostics: v.optional(diagnosticContext),
  },
  handler: async (
    ctx,
    { storyId, runId, diagnostics },
  ): Promise<Id<"_storage">> => trackedBuild(ctx, storyId, runId, diagnostics),
});
