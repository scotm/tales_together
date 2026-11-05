import { asString, asStringArray, parseJsonObject } from "./jsonReply";

export interface ParsedExtraction {
  chapterTitle: string;
  summaryBullets: string[];
  itemsUsed: string[];
  newItems: { id: string; name: string }[];
  unresolvedThreads: string[];
  illustrationPrompt: string;
  videoMotionPrompt: string;
}

const LABEL = "extraction";

/**
 * Prompt 4 replies are constrained by `responseSchema`, which is a request, not
 * a guarantee. This parse is what decides whether the story state moves.
 */
export function parseExtraction(
  raw: string,
  knownItemIds: ReadonlySet<string>,
): ParsedExtraction {
  const root = parseJsonObject(raw, LABEL);

  const summaryBullets = asStringArray(
    root.summaryBullets,
    "summaryBullets",
    LABEL,
  );
  if (summaryBullets.length !== 3) {
    throw new Error(`${LABEL}: expected exactly 3 summary bullets`);
  }

  // A hallucinated id would mark an item the child never packed; dropping it
  // keeps the backpack honest.
  const itemsUsed = asStringArray(root.itemsUsed, "itemsUsed", LABEL).filter(
    (id) => knownItemIds.has(id),
  );

  if (!Array.isArray(root.newItems)) {
    throw new Error(`${LABEL}: newItems was not an array`);
  }
  const seen = new Set<string>();
  const newItems = root.newItems
    .map((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error(`${LABEL}: newItems[${index}] was not an object`);
      }
      const item = entry as Record<string, unknown>;
      return {
        id: asString(item.id, `newItems[${index}].id`, LABEL),
        name: asString(item.name, `newItems[${index}].name`, LABEL),
      };
    })
    .filter((item) => {
      if (knownItemIds.has(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

  return {
    chapterTitle: asString(root.chapterTitle, "chapterTitle", LABEL),
    summaryBullets,
    itemsUsed: [...new Set(itemsUsed)],
    newItems,
    unresolvedThreads: asStringArray(
      root.unresolvedThreads,
      "unresolvedThreads",
      LABEL,
    ),
    illustrationPrompt: asString(
      root.illustrationPrompt,
      "illustrationPrompt",
      LABEL,
    ),
    videoMotionPrompt: asString(
      root.videoMotionPrompt,
      "videoMotionPrompt",
      LABEL,
    ),
  };
}
