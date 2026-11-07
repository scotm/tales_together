import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { bookFilename } from "./bookFilename";

export const bookDeliveryLabel = "📖 Save or Share the Book";

export async function saveBook(url: string, title: string): Promise<void> {
  if (!(await isAvailableAsync())) {
    throw new Error("File sharing is unavailable on this device.");
  }
  const directory = new Directory(
    Paths.cache,
    `book-export-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  directory.create();
  try {
    const file = await File.downloadFileAsync(
      url,
      new File(directory, bookFilename(title)),
    );
    await shareAsync(file.uri, {
      mimeType: "application/epub+zip",
      UTI: "org.idpf.epub-container",
      dialogTitle: "Save your storybook",
    });
  } finally {
    try {
      if (directory.exists) directory.delete();
    } catch {
      // Cache eviction can finish cleanup if the OS is still using the file.
    }
  }
}
