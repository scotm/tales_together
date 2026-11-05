import { asString, parseJsonObject } from "./jsonReply";

export type BeatStyle =
  | "BOLD_ACTION"
  | "CLEVER_TRICK"
  | "SILLY_TWIST"
  | "KID_WILDCARD";

export interface ParsedBeatCard {
  cardId: string;
  style: BeatStyle;
  title: string;
  kidFriendlyPitch: string;
  iconEmoji: string;
  suggestedItemId?: string;
}

export interface BeatPitch {
  recapOneLiner: string;
  cards: ParsedBeatCard[];
}

const STYLES: BeatStyle[] = [
  "BOLD_ACTION",
  "CLEVER_TRICK",
  "SILLY_TWIST",
  "KID_WILDCARD",
];

function fail(message: string): never {
  throw new Error(`bad beat pitch: ${message}`);
}

/**
 * The model is constrained by `responseSchema`, which is a request, not a
 * guarantee. This is the parse that decides whether anything gets stored.
 */
export function parseBeatPitch(
  raw: string,
  knownItemIds: ReadonlySet<string>,
): BeatPitch {
  const root = parseJsonObject(raw, "beat pitch");

  const recapOneLiner = asString(
    root.recapOneLiner,
    "recapOneLiner",
    "beat pitch",
  );
  if (!Array.isArray(root.cards)) fail("cards was not an array");
  if (root.cards.length !== 3) fail("expected exactly 3 cards");

  const cards = root.cards.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      fail(`card ${index} was not an object`);
    }
    const card = entry as Record<string, unknown>;
    const style = asString(card.style, `card ${index} style`, "beat pitch");
    if (!STYLES.includes(style as BeatStyle)) {
      fail(`card ${index} has unknown style ${style}`);
    }

    const suggested = card.suggestedItemId;
    const suggestedItemId =
      typeof suggested === "string" && suggested !== "" ? suggested : undefined;
    // A hallucinated catalog id would never match a backpack item, so drop it
    // rather than store a suggestion nothing can honour.
    const checked =
      suggestedItemId && knownItemIds.has(suggestedItemId)
        ? suggestedItemId
        : undefined;

    return {
      cardId: asString(card.cardId, `card ${index} cardId`, "beat pitch"),
      style: style as BeatStyle,
      title: asString(card.title, `card ${index} title`, "beat pitch"),
      kidFriendlyPitch: asString(
        card.kidFriendlyPitch,
        `card ${index} kidFriendlyPitch`,
        "beat pitch",
      ),
      iconEmoji: asString(
        card.iconEmoji,
        `card ${index} iconEmoji`,
        "beat pitch",
      ),
      ...(checked ? { suggestedItemId: checked } : {}),
    } satisfies ParsedBeatCard;
  });

  const distinct = new Set(cards.map((card) => card.cardId));
  if (distinct.size !== cards.length) fail("cardId values were not distinct");

  return { recapOneLiner, cards };
}
