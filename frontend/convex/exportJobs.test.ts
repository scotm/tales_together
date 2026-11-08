/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { createGeminiImageGenerator } from "./llm/image";
import schema from "./schema";

vi.mock("./llm/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./llm/image")>()),
  createGeminiImageGenerator: vi.fn(),
}));
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  // JSZip uses setImmediate internally; keep it on the real event loop.
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

async function seed() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.migrations.seedCatalog, {});
  const storyId = await t.mutation(internal.stories.create, {
    title: "Kites",
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
  await t.run(async (ctx) => {
    await ctx.db.patch(storyId, { status: "COMPLETED" });
    const chapters = await ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect();
    for (const chapter of chapters) {
      await ctx.db.patch(chapter._id, {
        status: "LOCKED",
        paragraphs: ["Mira ran."],
        extractionStatus: "DONE",
      });
    }
  });
  return { t, storyId };
}

test("repeated export requests claim one job and expose progress", async () => {
  const { t, storyId } = await seed();
  await t.mutation(api.exportJobs.retry, { storyId });
  const first = await t.run((ctx) => ctx.db.get(storyId));
  await t.mutation(api.exportJobs.retry, { storyId });
  const second = await t.run((ctx) => ctx.db.get(storyId));
  expect(first?.exportStatus).toBe("PREPARING_COVER");
  expect(first?.exportRunId).toBeDefined();
  expect(second?.exportRunId).toBe(first?.exportRunId);
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect()),
  ).toHaveLength(2);
});

test("a failed cover still produces a readable EPUB and a visible warning", async () => {
  const { t, storyId } = await seed();
  const generate = vi
    .fn()
    .mockRejectedValue(new Error("provider exhausted retries"));
  vi.mocked(createGeminiImageGenerator).mockReturnValue(generate);
  await t.mutation(api.exportJobs.retry, { storyId });
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
  const story = await t.run((ctx) => ctx.db.get(storyId));
  expect(generate).toHaveBeenCalledTimes(1);
  expect(story?.exportStatus).toBe("READY");
  expect(story?.epubFileId).toBeDefined();
  expect(story?.exportWarning).toContain("cover could not be made");
  expect(story?.exportRunId).toBeUndefined();

  const operations = await t.run((ctx) =>
    ctx.db.query("diagnosticOperations").collect(),
  );
  expect(
    operations.some(
      (operation) =>
        operation.name === "cover" && operation.status === "degraded",
    ),
  ).toBe(true);
  expect(
    operations.some(
      (operation) =>
        operation.name === "export" && operation.status === "succeeded",
    ),
  ).toBe(true);
  const events = await t.run((ctx) =>
    ctx.db.query("diagnosticEvents").collect(),
  );
  expect(events.some((event) => event.name === "export.degraded")).toBe(true);
});

test("disabling image spending still exports the book without a cover warning", async () => {
  const { t, storyId } = await seed();
  vi.stubEnv("IMAGE_PROVIDER", "disabled");
  await t.mutation(api.exportJobs.retry, { storyId });
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
  const story = await t.run((ctx) => ctx.db.get(storyId));
  expect(story?.exportStatus).toBe("READY");
  expect(story?.epubFileId).toBeDefined();
  expect(story?.exportWarning).toBeUndefined();
  expect(createGeminiImageGenerator).not.toHaveBeenCalled();
});

test("a failed build preserves prose and can be retried without regenerating art", async () => {
  const { t, storyId } = await seed();
  await t.run(async (ctx) => {
    const coverFileId = await ctx.storage.store(new Blob(["missing cover"]));
    await ctx.db.patch(storyId, { coverFileId });
    await ctx.storage.delete(coverFileId);
  });
  await expect(t.action(api.epub.build.buildEpub, { storyId })).rejects.toThrow(
    /chapters are saved/,
  );
  const failed = await t.run((ctx) => ctx.db.get(storyId));
  expect(failed?.exportStatus).toBe("FAILED");
  expect(failed?.exportError).toContain("Try again");
  expect(failed?.exportRunId).toBeUndefined();
  await t.run((ctx) => ctx.db.patch(storyId, { coverFileId: undefined }));
  await t.action(api.epub.build.buildEpub, { storyId });
  const ready = await t.run((ctx) => ctx.db.get(storyId));
  expect(ready?.exportStatus).toBe("READY");
  expect(ready?.exportError).toBeUndefined();
  expect(createGeminiImageGenerator).not.toHaveBeenCalled();
  const chapters = await t.run((ctx) =>
    ctx.db
      .query("chapters")
      .withIndex("by_story", (q) => q.eq("storyId", storyId))
      .collect(),
  );
  expect(
    chapters.every((chapter) => chapter.paragraphs[0] === "Mira ran."),
  ).toBe(true);
});

test("a watchdog releases a crashed job and stale workers cannot overwrite its retry", async () => {
  const { t, storyId } = await seed();
  const oldRunId = await t.mutation(internal.exportJobs.begin, {
    storyId,
    stage: "BUILDING",
  });
  if (!oldRunId) throw new Error("no export claim");
  await t.finishAllScheduledFunctions(() => vi.advanceTimersToNextTimer());
  expect((await t.run((ctx) => ctx.db.get(storyId)))?.exportStatus).toBe(
    "FAILED",
  );
  const runId = await t.mutation(internal.exportJobs.begin, {
    storyId,
    stage: "BUILDING",
  });
  await t.mutation(internal.exportJobs.fail, { storyId, runId: oldRunId });
  const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["EPUB"])));
  await expect(
    t.mutation(internal.exportJobs.complete, {
      storyId,
      runId: oldRunId,
      fileId,
    }),
  ).rejects.toThrow(/no longer active/);
  const current = await t.run((ctx) => ctx.db.get(storyId));
  expect(current?.exportRunId).toBe(runId);
  expect(current?.exportStatus).toBe("BUILDING");
  expect(current?.epubFileId).toBeUndefined();
});
