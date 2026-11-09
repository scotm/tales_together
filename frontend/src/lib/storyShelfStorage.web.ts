const KEY = "talesTogether.storyShelf";

// Private browsing or blocked storage just means an empty shelf.
export async function readShelf(): Promise<string | null> {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export async function writeShelf(value: string): Promise<void> {
  try {
    globalThis.localStorage?.setItem(KEY, value);
  } catch {}
}
