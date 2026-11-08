import { bookFilename } from "./bookFilename";

export const bookDeliveryLabel = "📖 Download the Book";

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
  onStage?.("fetch_started", { status: "started" });
  const response = await fetch(url);
  if (!response.ok) {
    onStage?.("fetch_failed", {
      level: "error",
      status: "failed",
      errorCode: "FILE_FETCH_FAILED",
      message: `HTTP ${response.status}`,
    });
    throw new Error("The book could not be downloaded.");
  }
  onStage?.("fetched", { status: "succeeded" });
  const objectUrl = URL.createObjectURL(await response.blob());
  onStage?.("blob_created", { status: "succeeded" });
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = bookFilename(title);
  document.body.appendChild(link);
  onStage?.("browser_handoff", { status: "started" });
  try {
    link.click();
    onStage?.("browser_handoff", {
      status: "succeeded",
      message: "The browser accepted the download; saving is unconfirmed.",
    });
  } finally {
    link.remove();
    // Give the browser time to start consuming the blob before revoking it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
