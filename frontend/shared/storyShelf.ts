/**
 * A device's "Recent stories" shelf: ids of the stories it made or opened,
 * newest first. There is deliberately no deployment-wide story list.
 */
export const STORY_SHELF_LIMIT = 20;

export function addToShelf(shelf: readonly string[], storyId: string) {
  return [storyId, ...shelf.filter((id) => id !== storyId)].slice(
    0,
    STORY_SHELF_LIMIT,
  );
}

/** Stored shelves are untrusted: anything unexpected becomes an empty shelf. */
export function parseShelf(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((id): id is string => typeof id === "string" && id.length < 64)
      .slice(0, STORY_SHELF_LIMIT);
  } catch {
    return [];
  }
}
