import { File, Paths } from "expo-file-system";

const shelfFile = () => new File(Paths.document, "story-shelf.json");

// An unreadable shelf is an empty shelf; it never blocks the workshop.
export async function readShelf(): Promise<string | null> {
  try {
    const file = shelfFile();
    return file.exists ? await file.text() : null;
  } catch {
    return null;
  }
}

export async function writeShelf(value: string): Promise<void> {
  try {
    await shelfFile().write(value);
  } catch {}
}
