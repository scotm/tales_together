import { bookFilename } from "./bookFilename";

export const bookDeliveryLabel = "📖 Download the Book";

export async function saveBook(url: string, title: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The book could not be downloaded.");
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = bookFilename(title);
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start consuming the blob before revoking it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
