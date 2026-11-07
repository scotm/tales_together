import { v } from "convex/values";
import JSZip from "jszip";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { action, internalAction } from "../_generated/server";
import { decodeBase64 } from "../llm/image";
import { FONT_FILES } from "./assets";
import {
  type ManifestItem,
  renderChapter,
  renderContainer,
  renderContentOpf,
  renderNav,
  renderTitlepage,
  STORYBOOK_CSS,
} from "./templates";

// One fixed timestamp for every entry so two builds of a story are identical.
const FIXED_DATE = new Date("2020-01-01T00:00:00Z");

async function runBuild(
  ctx: ActionCtx,
  storyId: Id<"stories">,
): Promise<Id<"_storage">> {
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
    });
  };
  const read = async (id: Id<"_storage">) => {
    const blob = await ctx.storage.get(id);
    if (!blob) throw new Error(`missing storage file ${id}`);
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
    add("OEBPS/images/cover.jpg", await read(story.coverFileId));
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
        await read(chapter.illustrationFileId),
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
  add("OEBPS/nav.xhtml", renderNav(ordered));
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
  await ctx.runMutation(internal.stories.setEpub, { storyId, fileId });
  return fileId;
}

export const buildEpub = action({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => runBuild(ctx, storyId),
});

/** Scheduler target: only internal functions may be scheduled. */
export const buildEpubInternal = internalAction({
  args: { storyId: v.id("stories") },
  handler: async (ctx, { storyId }) => runBuild(ctx, storyId),
});
