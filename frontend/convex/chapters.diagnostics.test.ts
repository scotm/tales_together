/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { createGeminiProvider } from "./llm/gemini";
import { getTextProvider } from "./llm/provider";
import schema from "./schema";

vi.mock("./llm/moderation", () => ({ moderate: async () => ({ ok: true }) }));
vi.mock("./llm/provider", () => ({ getTextProvider: vi.fn() }));
vi.mock("./lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/config")>()),
  PROVIDER_RETRY_BASE_MS: 1,
  PROVIDER_RETRY_MAX_MS: 5,
}));
const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getTextProvider).mockReset();
});

async function seed() {
  const t = convexTest(schema, modules);
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
      extractionStatus: "DONE",
    });
    return chapter._id;
  });
  return { t, chapterId };
}

function useProvider(fetchImpl: unknown) {
  const provider = createGeminiProvider({
    apiKey: "secret-key",
    model: "test-model",
    fetchImpl: fetchImpl as typeof fetch,
  });
  vi.mocked(getTextProvider).mockReturnValue(provider);
}

async function diagnostics(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const operations = await ctx.db.query("diagnosticOperations").collect();
    const events = await ctx.db.query("diagnosticEvents").collect();
    const receipts = await ctx.db.query("diagnosticReceipts").collect();
    return { operations, events, receipts };
  });
}

test("an injected provider failure reconstructs retries, the final error and the saved recovery", async () => {
  const { t, chapterId } = await seed();
  useProvider(
    vi
      .fn()
      .mockImplementation(async () => new Response("busy", { status: 503 })),
  );
  const failure = expect(
    t.action(api.chapters.writeChapter, {
      chapterId,
      clientOperationId: "client-write-1",
    }),
  ).rejects.toThrow(/choice is saved/);
  await failure;

  const { operations, events, receipts } = await diagnostics(t);
  const write = operations.find((operation) => operation.name === "write");
  expect(write?.operationId).toBe("client-write-1");
  expect(write?.status).toBe("failed");
  expect(write?.errorCode).toBe("PROVIDER_HTTP_ERROR");
  expect(write?.attempts).toBe(4);
  expect(write?.retries).toBe(3);
  expect(receipts).toHaveLength(4);
  expect(
    receipts.every(
      (receipt) =>
        receipt.outcome === "failed" &&
        receipt.costBasis === "unknown" &&
        receipt.costMicroUsd === undefined,
    ),
  ).toBe(true);

  const names = events.map((event) => event.name);
  expect(names).toContain("operation.failed");
  expect(
    events.filter((event) => event.name === "provider.attempt.failed"),
  ).toHaveLength(4);

  const chapter = await t.run((ctx) => ctx.db.get(chapterId));
  expect(chapter?.status).toBe("DIRECTING");
  expect(chapter?.writingError).toContain("Try again");
});

test("a failed optional expansion is stored as a degraded success", async () => {
  const { t, chapterId } = await seed();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        candidates: [
          { content: { parts: [{ text: "Mira ran past the boats." }] } },
        ],
      }),
    )
    .mockResolvedValue(new Response("denied", { status: 401 }));
  useProvider(fetchImpl);

  await expect(
    t.action(api.chapters.writeChapter, { chapterId }),
  ).resolves.toEqual(["Mira ran past the boats."]);

  const { operations, events } = await diagnostics(t);
  const write = operations.find((operation) => operation.name === "write");
  expect(write?.status).toBe("succeeded");
  expect(events).toContainEqual(
    expect.objectContaining({
      name: "operation.degraded",
      status: "degraded",
      errorCode: "PROSE_EXPANSION_FAILED",
    }),
  );
  expect(events.some((event) => event.name === "provider.attempt.failed")).toBe(
    true,
  );
});
