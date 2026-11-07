import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  renderChapter,
  renderContentOpf,
  renderCover,
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
      spine: ["cover", "titlepage", "chapter-1"],
    });

    expect(opf).toContain('id="cover-image"');
    expect(opf).toContain("urn:tales-together:story_1");
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain(
      'idref="cover" properties="rendition:layout-pre-paginated rendition:spread-none"',
    );
    expect(opf).toContain('<itemref idref="chapter-1" />');
    expect(opf).toContain('href="text/chapter_1.xhtml"');
    expect(opf.indexOf('idref="titlepage"')).toBeLessThan(
      opf.indexOf('idref="chapter-1"'),
    );
    expect(opf).toContain(
      '<meta property="dcterms:modified">2026-11-05T12:00:00Z</meta>',
    );
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

  it("keeps the title page separate from the full-page cover", () => {
    const titlepage = renderTitlepage({ title: "Book", setting: "Sea" });
    expect(titlepage).toContain("Book");
    expect(titlepage).toContain("Sea");
    expect(titlepage).not.toContain("cover.jpg");
  });

  it("fits the cover into one portrait page without chapter margins", () => {
    const cover = renderCover("Kites & <Clouds>");
    expect(cover).toContain("Kites &amp; &lt;Clouds&gt;");
    expect(cover).toContain('content="width=1600, height=2400"');
    expect(cover).toContain('viewBox="0 0 1600 2400"');
    expect(cover).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(cover).toContain("margin: 0; padding: 0;");
    expect(cover).not.toContain("storybook.css");
  });

  it("escapes the title in the title page", () => {
    expect(escapeHtml("<Book>")).toBe("&lt;Book&gt;");
  });

  it("keeps the stylesheet free of remote fonts", () => {
    expect(STORYBOOK_CSS).not.toContain("@import");
    expect(STORYBOOK_CSS).not.toContain("http");
  });
});
