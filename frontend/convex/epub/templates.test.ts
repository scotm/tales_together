import { describe, expect, it } from "vitest";
import { FONT_FILES } from "./assets";
import {
  escapeHtml,
  renderChapter,
  renderContentOpf,
  renderNav,
  renderTitlepage,
  STORYBOOK_CSS,
} from "./templates";

describe("epub templates", () => {
  it("escapes markup instead of letting prose become XML", () => {
    const chapter = renderChapter({
      index: 2,
      title: "A <Bold> Title & Co",
      paragraphs: ['Mira said "hi" <script>alert(1)</script>'],
      hasImage: false,
    });

    expect(chapter).toContain("A &lt;Bold&gt; Title &amp; Co");
    expect(chapter).toContain(
      "Mira said &quot;hi&quot; &lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(chapter).not.toContain("<script>");
  });

  it("links the illustration only when the chapter has one", () => {
    const withImage = renderChapter({
      index: 3,
      title: "Suds",
      paragraphs: ["One."],
      hasImage: true,
    });
    const without = renderChapter({
      index: 3,
      title: "Suds",
      paragraphs: ["One."],
      hasImage: false,
    });

    expect(withImage).toContain("../images/ch_3.jpg");
    expect(without).not.toContain("<figure");
  });

  it("lists every manifest item and keeps spine order", () => {
    const opf = renderContentOpf({
      storyId: "story_1",
      title: "The Windy Kite",
      creator: "Mira",
      createdAt: Date.UTC(2026, 10, 5, 12, 0, 0),
      manifest: [
        {
          id: "cover-image",
          href: "images/cover.jpg",
          mediaType: "image/jpeg",
          properties: "cover-image",
        },
        {
          id: "chapter-1",
          href: "text/chapter_1.xhtml",
          mediaType: "application/xhtml+xml",
        },
      ],
      spine: ["titlepage", "chapter-1"],
    });

    expect(opf).toContain('id="cover-image"');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('href="text/chapter_1.xhtml"');
    expect(opf.indexOf('idref="titlepage"')).toBeLessThan(
      opf.indexOf('idref="chapter-1"'),
    );
    expect(opf).toContain(
      '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>',
    );
    expect(opf).toContain("<dc:creator>Mira</dc:creator>");
  });

  it("builds a table of contents for every chapter", () => {
    const nav = renderNav([
      { index: 1, title: "The Kite" },
      { index: 2, title: "The Bathtub" },
    ]);

    expect(nav).toContain('href="text/chapter_1.xhtml"');
    expect(nav).toContain('href="text/chapter_2.xhtml"');
    expect(nav).toContain('epub:type="toc"');
  });

  it("keeps the cover out of the title page and prints its credit", () => {
    const page = renderTitlepage({
      title: "Book",
      setting: "Sea",
      authorName: "Mira <Mouse>",
    });

    expect(page).not.toContain("cover.jpg");
    expect(page).toContain("An Original Interactive Storybook");
    expect(page).toContain("by Mira &lt;Mouse&gt;");
    expect(renderTitlepage({ title: "Book", setting: "Sea" })).toContain(
      "by A Young Author",
    );
  });

  it("escapes the title in the title page", () => {
    expect(escapeHtml("<Book>")).toBe("&lt;Book&gt;");
  });

  it("embeds the storybook fonts instead of fetching them", () => {
    expect(STORYBOOK_CSS).toContain("@font-face");
    expect(STORYBOOK_CSS).toContain("Lexend-Regular.woff2");
    expect(STORYBOOK_CSS).toContain("Fraunces-Bold.woff2");
    expect(STORYBOOK_CSS).not.toContain("@import");
    expect(STORYBOOK_CSS).not.toContain("http");
    expect(FONT_FILES.map((font) => font.filename)).toEqual([
      "Lexend-Regular.woff2",
      "Fraunces-Bold.woff2",
    ]);
    expect(FONT_FILES.every((font) => font.base64.length > 0)).toBe(true);
  });
});
