import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { bookFilename } from "./bookFilename";

export const bookDeliveryLabel = "📖 Save or Share the Book";

export type SaveBookStage = (
  stage: string,
  fields?: {
    level?: "info" | "warn" | "error";
    status?: "started" | "succeeded" | "failed" | "degraded";
    errorCode?: string;
    message?: string;
  },
) => void;

export async function saveBook(
  url: string,
  title: string,
  onStage?: SaveBookStage,
): Promise<void> {
  onStage?.("sharing_check", { status: "started" });
  if (!(await isAvailableAsync())) {
    onStage?.("sharing_unavailable", {
      level: "warn",
      status: "failed",
      errorCode: "SHARING_UNAVAILABLE",
      message: "File sharing is unavailable on this device.",
    });
    throw new Error("File sharing is unavailable on this device.");
  }
  const directory = new Directory(
    Paths.cache,
    `book-export-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  directory.create();
  try {
    onStage?.("download_started", { status: "started" });
    const file = await File.downloadFileAsync(
      url,
      new File(directory, bookFilename(title)),
    );
    onStage?.("downloaded", { status: "succeeded" });
    onStage?.("share_opened", { status: "started" });
    await shareAsync(file.uri, {
      mimeType: "application/epub+zip",
      UTI: "org.idpf.epub-container",
      dialogTitle: "Save your storybook",
    });
    onStage?.("share_returned", {
      status: "succeeded",
      message: "The share sheet closed; importing the book is unconfirmed.",
    });
  } finally {
    try {
      if (directory.exists) directory.delete();
    } catch {
      // Cache eviction can finish cleanup if the OS is still using the file.
      onStage?.("cleanup_failed", {
        level: "warn",
        status: "degraded",
        errorCode: "FILE_CLEANUP_FAILED",
        message: "The temporary book folder could not be deleted.",
      });
    }
  }
}
