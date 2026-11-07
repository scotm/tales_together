import { saveBook } from "./saveBook.web";

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);
const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const originalFetch = globalThis.fetch;
const click = jest.fn();
const remove = jest.fn();
let link: {
  click: typeof click;
  remove: typeof remove;
  download?: string;
  href?: string;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  link = { click, remove };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => link, body: { appendChild: jest.fn() } },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: jest.fn(() => "blob:book"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: jest.fn(),
  });
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, blob: async () => new Blob(["book"]) });
});
afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  for (const [target, key, original] of [
    [globalThis, "document", originalDocument],
    [URL, "createObjectURL", originalCreate],
    [URL, "revokeObjectURL", originalRevoke],
  ] as const) {
    if (original) Object.defineProperty(target, key, original);
    else Reflect.deleteProperty(target, key);
  }
});

it("downloads a named blob and releases its temporary URL", async () => {
  await saveBook("https://example.test/book.epub", "Kites / Clouds");
  expect(link.download).toBe("Kites - Clouds.epub");
  expect(link.href).toBe("blob:book");
  expect(click).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  jest.runAllTimers();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:book");
});

it("does not offer an HTTP error as an EPUB", async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
  await expect(
    saveBook("https://example.test/book.epub", "Book"),
  ).rejects.toThrow(/downloaded/);
  expect(click).not.toHaveBeenCalled();
});
