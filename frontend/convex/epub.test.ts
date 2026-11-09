/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import JSZip from "jszip";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
// Invited Clerk guests are the only callers of public functions.
const guest = { subject: "user_guest" };

test.each([true, false])(
  "exports a complete archive with cover present: %s",
  async (hasCover) => {
    const t = convexTest(schema, modules).withIdentity(guest);
    await t.mutation(internal.migrations.seedCatalog, {});
    const storyId = await t.mutation(internal.stories.create, {
      title: "The Windy Kite",
      setting: "A seaside town",
      centralProblem: "Too much wind",
      protagonistName: "Mira",
      protagonistQuirk: "Loves kites",
      visualDescription: "A girl in a yellow raincoat",
      backpackItems: [
        { id: "item_whisk", name: "Whisk" },
        { id: "item_jam", name: "Jam" },
        { id: "item_kazoo", name: "Kazoo" },
      ],
    });
    const coverBytes = new Uint8Array([255, 216, 255, 217]);
    await t.run(async (ctx) => {
      if (hasCover) {
        const coverFileId = await ctx.storage.store(
          new Blob([coverBytes], { type: "image/jpeg" }),
        );
        await ctx.db.patch(storyId, { coverFileId });
      }
      const chapters = await ctx.db
        .query("chapters")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .collect();
      for (const chapter of chapters) {
        await ctx.db.patch(chapter._id, {
          status: "LOCKED",
          title: `Kite ${chapter.index}`,
          paragraphs: ["Mira held on tight."],
        });
      }
    });

    const build = async () => {
      const fileId = await t.action(api.epub.build.buildEpub, { storyId });
      const buffer = await t.run(async (ctx) => {
        const blob = await ctx.storage.get(fileId);
        if (!blob) throw new Error("missing EPUB");
        return blob.arrayBuffer();
      });
      return new Uint8Array(buffer);
    };
    const bytes = await build();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 86_400_000);
      expect(await build()).toEqual(bytes);
    } finally {
      vi.useRealTimers();
    }
    const zip = await JSZip.loadAsync(bytes);
    const opf = await zip.file("OEBPS/content.opf")?.async("string");
    const titlepage = await zip
      .file("OEBPS/text/titlepage.xhtml")
      ?.async("string");
    expect(titlepage).not.toContain("cover.jpg");
    expect(zip.file("OEBPS/text/chapter_5.xhtml")).not.toBeNull();
    if (hasCover) {
      expect(opf).toContain(
        '<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml" properties="svg" />',
      );
      expect(opf?.indexOf('idref="cover"')).toBeLessThan(
        opf?.indexOf('idref="titlepage"') ?? -1,
      );
      expect(
        await zip.file("OEBPS/images/cover.jpg")?.async("uint8array"),
      ).toEqual(coverBytes);
      expect(await zip.file("OEBPS/nav.xhtml")?.async("string")).toContain(
        'epub:type="cover" href="text/cover.xhtml"',
      );
    } else {
      expect(zip.file("OEBPS/text/cover.xhtml")).toBeNull();
      expect(opf).not.toContain('idref="cover"');
    }
  },
  20_000,
);
