import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { Share } from "react-native";

export async function copyText(text: string): Promise<void> {
  await Share.share({ message: text, title: "Diagnostics" });
}

export async function saveDiagnostics(
  text: string,
  filename: string,
): Promise<void> {
  if (!(await isAvailableAsync())) {
    await Share.share({ message: text, title: filename });
    return;
  }
  try {
    const directory = new Directory(Paths.cache, "diagnostics");
    directory.create({ idempotent: true, intermediates: true });
    const file = new File(directory, filename);
    await file.write(text);
    await shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Share diagnostics",
    });
  } catch {
    // Files or the share sheet can be unavailable; the text is the fallback.
    await Share.share({ message: text, title: filename });
  }
}
