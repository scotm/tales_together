/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { GENERATION_LEASE_MS } from "./lib/config";
import { createGeminiProvider } from "./llm/gemini";
import { getTextProvider } from "./llm/provider";
import schema from "./schema";

vi.mock("./llm/moderation", () => ({ moderate: async () => ({ ok: true }) }));
vi.mock("./llm/provider", () => ({ getTextProvider: vi.fn() }));
const modules = import.meta.glob("./**/*.ts");
// Invited Clerk guests are the only callers of public functions.
const guest = { subject: "user_guest" };
const prose = Array.from(
  { length: 40 },
  () => "Mira held the kite and ran past the boats.",
).join("\n\n");

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(getTextProvider).mockReset();
});

async function seed() {
  const t = convexTest(schema, modules).withIdentity(guest);
  await t.mutation(internal.migrations.seedCatalog, {});
  const storyId = await t.mutation(internal.stories.create, {
    title: "The Windy Kite",
    setting: "The seaside",
    centralProblem: "A lost kite",
    protagonistName: "Mira",
    protagonistQuirk: "Loves kites",
    visualDescription: "Yellow coat",
    backpackItems: [
      { id: "item_whisk", name: "Whisk" },
      { id: "item_jam", name: "Jam" },
      { id: "item_kazoo", name: "Kazoo" },
    ],
  });
  const chapterId = await t.run(async (ctx) => {
    const chapter = await ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .first();
    if (!chapter) throw new Error("missing chapter");
    const beat = {
      cardId: "card_a",
      style: "BOLD_ACTION" as const,
      title: "Chase it",
      kidFriendlyPitch: "Run to the boats",
      iconEmoji: "🏃",
    };
    await ctx.db.patch(chapter._id, {
      status: "DIRECTING",
      beatCards: [beat],
      chosenBeat: beat,
      // Isolate writing recovery from background extraction/provider calls.
      extractionStatus: "DONE",
    });
    return chapter._id;
  });
  return { t, chapterId };
}

function useProvider(fetchImpl: unknown) {
  let notify!: () => void;
  const firstRetry = new Promise<void>((resolve) => {
    notify = resolve;
  });
  const provider = createGeminiProvider({
    apiKey: "secret-key",
    model: "test-model",
    fetchImpl: fetchImpl as typeof fetch,
  });
  vi.mocked(getTextProvider).mockReturnValue({
    name: provider.name,
    complete: (request, progress) =>
      provider.complete(request, {
        onRetry: async (retry) => {
          await progress?.onRetry?.(retry);
          notify();
        },
      }),
  });
  return firstRetry;
}
const reply = (text = prose) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] } }] });

test("a transient failure publishes retry progress then completes the chapter", async () => {
  const { t, chapterId } = await seed();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(new Response("busy", { status: 503 }))
    .mockResolvedValueOnce(reply());
  const firstRetry = useProvider(fetchImpl);
  const writing = t.action(api.chapters.writeChapter, { chapterId });
  await firstRetry;
  const pending = await t.run((ctx) => ctx.db.get(chapterId));
  expect(pending?.status).toBe("WRITING");
  expect(pending?.writingRetry?.attempt).toBe(2);
  await vi.advanceTimersByTimeAsync(1000);
  await expect(writing).resolves.toHaveLength(40);
  const chapter = await t.run((ctx) => ctx.db.get(chapterId));
  expect(chapter?.status).toBe("REVIEWING");
  expect(chapter?.writingError).toBeUndefined();
  expect(chapter?.writingRetry).toBeUndefined();
});

test("exhausted retries keep the card and allow a successful manual retry", async () => {
  const { t, chapterId } = await seed();
  const fetchImpl = vi
    .fn()
    .mockImplementation(
      async () => new Response("secret-key", { status: 503 }),
    );
  const firstRetry = useProvider(fetchImpl);
  const failure = expect(
    t.action(api.chapters.writeChapter, { chapterId }),
  ).rejects.toThrow(/choice is saved/);
  await firstRetry;
  await vi.advanceTimersByTimeAsync(7000);
  await failure;
  const chapter = await t.run((ctx) => ctx.db.get(chapterId));
  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(chapter?.status).toBe("DIRECTING");
  expect(chapter?.chosenBeat?.cardId).toBe("card_a");
  expect(chapter?.paragraphs).toEqual([]);
  expect(chapter?.writingError).toContain("Try again");
  expect(chapter?.writingRunId).toBeUndefined();
  fetchImpl.mockResolvedValue(reply());
  await t.action(api.chapters.writeChapter, { chapterId });
  expect((await t.run((ctx) => ctx.db.get(chapterId)))?.status).toBe(
    "REVIEWING",
  );
  // Reopening a completed chapter must not spend another provider request.
  await t.action(api.chapters.writeChapter, { chapterId });
  expect(fetchImpl).toHaveBeenCalledTimes(5);
});

test("configuration exceptions also release WRITING", async () => {
  const { t, chapterId } = await seed();
  vi.mocked(getTextProvider).mockImplementation(() => {
    throw new Error("missing secret-key");
  });
  await expect(
    t.action(api.chapters.writeChapter, { chapterId }),
  ).rejects.toThrow(/choice is saved/);
  const chapter = await t.run((ctx) => ctx.db.get(chapterId));
  expect(chapter?.status).toBe("DIRECTING");
  expect(chapter?.writingError).not.toContain("secret-key");
});

test("a failed optional expansion preserves the valid first draft", async () => {
  const { t, chapterId } = await seed();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(reply("Mira ran past the boats."))
    .mockResolvedValue(new Response("denied", { status: 401 }));
  useProvider(fetchImpl);
  await expect(
    t.action(api.chapters.writeChapter, { chapterId }),
  ).resolves.toEqual(["Mira ran past the boats."]);
  expect((await t.run((ctx) => ctx.db.get(chapterId)))?.status).toBe(
    "REVIEWING",
  );
});

test("a second caller cannot claim an active writing attempt", async () => {
  const { t, chapterId } = await seed();
  await t.mutation(internal.chapters.beginWriting, { chapterId });
  await expect(
    t.mutation(internal.chapters.beginWriting, { chapterId }),
  ).rejects.toThrow(/not DIRECTING/);
});

test("a crash watchdog releases a chapter and stale workers cannot overwrite its retry", async () => {
  const { t, chapterId } = await seed();
  const oldRunId = await t.mutation(internal.chapters.beginWriting, {
    chapterId,
  });
  await t.finishAllScheduledFunctions(() =>
    vi.advanceTimersByTime(GENERATION_LEASE_MS),
  );
  expect((await t.run((ctx) => ctx.db.get(chapterId)))?.status).toBe(
    "DIRECTING",
  );
  const runId = await t.mutation(internal.chapters.beginWriting, { chapterId });
  await t.mutation(internal.chapters.recoverWriting, {
    chapterId,
    runId: oldRunId,
  });
  await t.mutation(internal.chapters.abandonWriting, {
    chapterId,
    runId: oldRunId,
    error: "old failure",
  });
  await expect(
    t.mutation(internal.chapters.setChapterProse, {
      chapterId,
      runId: oldRunId,
      paragraphs: ["Stale prose."],
    }),
  ).rejects.toThrow(/no longer active/);
  await expect(
    t.mutation(internal.chapters.setChapterProse, {
      chapterId,
      paragraphs: ["Legacy worker prose."],
    }),
  ).rejects.toThrow(/no longer active/);
  const chapter = await t.run((ctx) => ctx.db.get(chapterId));
  expect(chapter?.writingRunId).toBe(runId);
  expect(chapter?.status).toBe("WRITING");
  expect(chapter?.paragraphs).toEqual([]);
});

test("legacy chapters already stuck in WRITING can be retried", async () => {
  const { t, chapterId } = await seed();
  await t.run((ctx) => ctx.db.patch(chapterId, { status: "WRITING" }));
  useProvider(vi.fn().mockResolvedValue(reply()));
  await expect(
    t.action(api.chapters.writeChapter, { chapterId }),
  ).resolves.toHaveLength(40);
});
