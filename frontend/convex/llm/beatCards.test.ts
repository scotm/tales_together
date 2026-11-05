import { describe, expect, it } from "vitest";
import { parseBeatPitch } from "./beatCards";

const valid = JSON.stringify({
  recapOneLiner: "Previously: the cake grew wings!",
  cards: [
    {
      cardId: "card_1a",
      style: "BOLD_ACTION",
      title: "Chase the cake",
      kidFriendlyPitch: "Grab a net and swim after it!",
      iconEmoji: "⚔️",
      suggestedItemId: "item_whisk",
    },
    {
      cardId: "card_1b",
      style: "CLEVER_TRICK",
      title: "Build a cake trap",
      kidFriendlyPitch: "Use the jam to lure it down.",
      iconEmoji: "🧠",
      suggestedItemId: "item_jam",
    },
    {
      cardId: "card_1c",
      style: "SILLY_TWIST",
      title: "The cake talks",
      kidFriendlyPitch: "The cake asks for a hat.",
      iconEmoji: "🤪",
      suggestedItemId: "item_hat",
    },
  ],
});

const items = new Set(["item_whisk", "item_jam", "item_kazoo"]);

describe("parseBeatPitch", () => {
  it("keeps catalog suggestions and drops hallucinated item ids", () => {
    const pitch = parseBeatPitch(valid, items);

    expect(pitch.cards).toHaveLength(3);
    expect(pitch.cards[0]?.suggestedItemId).toBe("item_whisk");
    // item_hat is not in the catalog: better no suggestion than a dead one.
    expect(pitch.cards[2]?.suggestedItemId).toBeUndefined();
  });

  it("accepts a fenced JSON reply", () => {
    const pitch = parseBeatPitch(`\`\`\`json\n${valid}\n\`\`\``, items);
    expect(pitch.recapOneLiner).toContain("cake");
  });

  it("rejects fewer than three cards", () => {
    const twoCards = JSON.stringify({
      recapOneLiner: "Previously: nothing",
      cards: JSON.parse(valid).cards.slice(0, 2),
    });

    expect(() => parseBeatPitch(twoCards, items)).toThrow(/exactly 3/);
  });

  it("rejects prose instead of JSON", () => {
    expect(() => parseBeatPitch("Once upon a time", items)).toThrow(/not JSON/);
  });

  it("rejects duplicate card ids", () => {
    const payload = JSON.parse(valid);
    payload.cards[1].cardId = payload.cards[0].cardId;

    expect(() => parseBeatPitch(JSON.stringify(payload), items)).toThrow(
      /distinct/,
    );
  });
});
