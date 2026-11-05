import { describe, expect, it } from "vitest";
import { extractionFields } from "../chapters";
import { parseExtraction } from "./extraction";
import { EXTRACTION_SCHEMA } from "./jsonSchemas";

const known = new Set(["item_whisk", "item_kazoo"]);

function reply(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    chapterTitle: "The Whisk Wind",
    summaryBullets: ["Mira met a kite.", "It blew away.", "She whisked wind."],
    itemsUsed: ["item_whisk", "item_telephone"],
    newItems: [{ id: "item_feather", name: "Rainbow Feather" }],
    unresolvedThreads: ["Where is the kite?"],
    illustrationPrompt: "A girl in a yellow raincoat whisking a whirlwind.",
    videoMotionPrompt: "Wind lifts the raincoat hem; fries circle slowly.",
    ...overrides,
  });
}

describe("extraction parse", () => {
  it("keeps known items and drops hallucinated ones", () => {
    const parsed = parseExtraction(reply(), known);
    expect(parsed.itemsUsed).toEqual(["item_whisk"]);
    expect(parsed.newItems).toEqual([
      { id: "item_feather", name: "Rainbow Feather" },
    ]);
    expect(parsed.summaryBullets).toHaveLength(3);
  });

  it("rejects a summary that is not exactly three bullets", () => {
    expect(() =>
      parseExtraction(reply({ summaryBullets: ["only one"] }), known),
    ).toThrow(/exactly 3/);
  });

  it("drops a new item that repeats a known id, keeping the first", () => {
    const parsed = parseExtraction(
      reply({
        newItems: [
          { id: "item_whisk", name: "Another Whisk" },
          { id: "item_feather", name: "Rainbow Feather" },
          { id: "item_feather", name: "Feather Again" },
        ],
      }),
      known,
    );
    expect(parsed.newItems).toEqual([
      { id: "item_feather", name: "Rainbow Feather" },
    ]);
  });

  it("recovers JSON wrapped in a fence", () => {
    const parsed = parseExtraction(`\`\`\`json\n${reply()}\n\`\`\``, known);
    expect(parsed.chapterTitle).toBe("The Whisk Wind");
  });
});

describe("schema and validator agree", () => {
  it("covers exactly the fields the mutation accepts", () => {
    expect(new Set(Object.keys(EXTRACTION_SCHEMA.properties))).toEqual(
      new Set(Object.keys(extractionFields)),
    );
    expect(new Set(EXTRACTION_SCHEMA.required)).toEqual(
      new Set(Object.keys(extractionFields)),
    );
  });
});
