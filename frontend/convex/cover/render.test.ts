import { describe, expect, it } from "vitest";
import { renderCoverSvg } from "./render";

const art = "data:image/jpeg;base64,AAAA";

describe("cover renderer", () => {
  it("draws portrait art with the title and typed author credit", () => {
    const svg = renderCoverSvg({
      title: "Barnaby & the Runaway Cake",
      authorName: "Leo",
      artHref: art,
    });

    expect(svg).toContain('width="1600" height="2400"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain("Barnaby &amp;");
    expect(svg).toContain("the Runaway");
    expect(svg).toContain("Written by Leo");
  });

  it("escapes markup and falls back to a typed credit", () => {
    const svg = renderCoverSvg({
      title: "<Cake>",
      artHref: art,
    });

    expect(svg).toContain("&lt;Cake&gt;");
    expect(svg).not.toContain("<Cake>");
    expect(svg).toContain("Written by A Young Author");
  });

  it("keeps long titles to three display lines", () => {
    const svg = renderCoverSvg({
      title: "Barnaby Whiskers and the Runaway Royal Cake",
      artHref: art,
    });
    const titleLines = svg.match(/font-family="Fraunces"/g) ?? [];

    expect(titleLines.length).toBeLessThanOrEqual(3);
  });
});
