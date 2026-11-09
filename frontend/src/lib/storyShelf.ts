import { useEffect, useState } from "react";
import { addToShelf, parseShelf } from "../../shared/storyShelf";
import { readShelf, writeShelf } from "./storyShelfStorage";

let cached: string[] | null = null;
let loading: Promise<string[]> | null = null;
const listeners = new Set<(ids: string[]) => void>();

function load() {
  if (cached) return Promise.resolve(cached);
  loading ??= readShelf().then((raw) => {
    cached ??= parseShelf(raw);
    return cached;
  });
  return loading;
}

/** Puts a story at the front of this device's shelf. Never throws. */
export async function rememberStory(storyId: string) {
  const next = addToShelf(await load(), storyId);
  cached = next;
  for (const listener of listeners) listener(next);
  await writeShelf(JSON.stringify(next));
}

/** This device's story ids, newest first; undefined until read. */
export function useStoryShelf() {
  const [ids, setIds] = useState<string[] | undefined>(cached ?? undefined);
  useEffect(() => {
    let live = true;
    listeners.add(setIds);
    void load().then((shelf) => {
      if (live) setIds(shelf);
    });
    return () => {
      live = false;
      listeners.delete(setIds);
    };
  }, []);
  return ids;
}
