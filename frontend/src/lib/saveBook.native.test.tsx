import { Directory, File } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { saveBook } from "./saveBook.native";

jest.mock("expo-file-system", () => ({
  Paths: { cache: "file:///cache" },
  Directory: jest.fn(),
  File: Object.assign(jest.fn(), { downloadFileAsync: jest.fn() }),
}));
jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const remove = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  (Directory as unknown as jest.Mock).mockImplementation(() => ({
    create: jest.fn(),
    exists: true,
    delete: remove,
  }));
  (File as unknown as jest.Mock).mockImplementation((_directory, name) => ({
    uri: `file:///cache/${name}`,
  }));
  (File.downloadFileAsync as jest.Mock).mockImplementation(
    async (_url, destination) => destination,
  );
  (isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (shareAsync as jest.Mock).mockResolvedValue(undefined);
});

it("shares a downloaded EPUB file URI rather than a remote URL", async () => {
  await saveBook("https://example.test/book.epub", "The Windy Kite");
  expect(shareAsync).toHaveBeenCalledWith(
    "file:///cache/The Windy Kite.epub",
    expect.objectContaining({
      mimeType: "application/epub+zip",
      UTI: "org.idpf.epub-container",
    }),
  );
  expect(remove).toHaveBeenCalledTimes(1);
});

it("cleans up a partially downloaded file on failure", async () => {
  (File.downloadFileAsync as jest.Mock).mockRejectedValueOnce(
    new Error("download failed"),
  );
  await expect(
    saveBook("https://example.test/book.epub", "Book"),
  ).rejects.toThrow("download failed");
  expect(shareAsync).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
});

it("does not download a file when device sharing is unavailable", async () => {
  (isAvailableAsync as jest.Mock).mockResolvedValue(false);
  await expect(
    saveBook("https://example.test/book.epub", "Book"),
  ).rejects.toThrow(/unavailable/);
  expect(File.downloadFileAsync).not.toHaveBeenCalled();
});
