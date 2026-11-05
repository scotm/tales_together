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

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${field} must be a non-empty string`);
  }
  return value;
}

/**
 * The model is constrained by `responseSchema`, which is a request, not a
 * guarantee. This is the parse that decides whether anything gets stored.
 */
export function parseBeatPitch(
  raw: string,
  knownItemIds: ReadonlySet<string>,
): BeatPitch {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Some providers wrap JSON in prose even in JSON mode. Recover the object
    // before giving up, so one stray sentence does not waste the call.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) {
      fail(`response was not JSON: ${JSON.stringify(text.slice(0, 200))}`);
    }
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      fail(`response was not JSON: ${JSON.stringify(text.slice(0, 200))}`);
    }
  }

  if (typeof parsed !== "object" || parsed === null)
    fail("response was not an object");
  const root = parsed as Record<string, unknown>;

  const recapOneLiner = asString(root.recapOneLiner, "recapOneLiner");
  if (!Array.isArray(root.cards)) fail("cards was not an array");
  if (root.cards.length !== 3) fail("expected exactly 3 cards");

  const cards = root.cards.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      fail(`card ${index} was not an object`);
    }
    const card = entry as Record<string, unknown>;
    const style = asString(card.style, `card ${index} style`);
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
      cardId: asString(card.cardId, `card ${index} cardId`),
      style: style as BeatStyle,
      title: asString(card.title, `card ${index} title`),
      kidFriendlyPitch: asString(
        card.kidFriendlyPitch,
        `card ${index} kidFriendlyPitch`,
      ),
      iconEmoji: asString(card.iconEmoji, `card ${index} iconEmoji`),
      ...(checked ? { suggestedItemId: checked } : {}),
    } satisfies ParsedBeatCard;
  });

  const distinct = new Set(cards.map((card) => card.cardId));
  if (distinct.size !== cards.length) fail("cardId values were not distinct");

  return { recapOneLiner, cards };
}
