/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { SIGN_IN_REQUIRED } from "./lib/access";
import schema from "./schema";
import { LIBRARY_FULL } from "./stories";

const modules = import.meta.glob("./**/*.ts");
const sources = import.meta.glob<string>(
  ["./**/*.ts", "!./**/*.test.ts", "!./_generated/**"],
  { query: "?raw", import: "default", eager: true },
);
const guest = { subject: "user_guest" };

// Deliberately public: it returns only a timestamp, and the Diagnostics
// connection check must work before anyone signs in.
const UNGATED = new Set(["./diagnostics.ts:ping"]);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function setup() {
  const anonymous = convexTest(schema, modules);
  await anonymous.mutation(internal.migrations.seedCatalog, {});
  const t = anonymous.withIdentity(guest);
  const catalog = await t.query(api.catalog.listChoices, {});
  const ref = (key: string) => {
    const option = catalog.options.find((row) => row.key === key);
    if (!option) throw new Error(`Missing ${key}`);
    return { optionId: option.optionId, revision: option.revision };
  };
  const args = {
    setting: ref("set_bakery"),
    problem: ref("prob_cake"),
    character: ref("hero_otter"),
    outfit: ref("out_chef"),
    quirk: ref("quirk_bubbles"),
    packed: [ref("item_whisk"), ref("item_jam"), ref("item_kazoo")],
    protagonistName: "Mira",
    kidGender: "open" as const,
  };
  return { anonymous, t, args };
}

describe("access gate", () => {
  test("every public function checks sign-in before doing anything", () => {
    const publicFunction =
      /^export const (\w+) = (?:query|mutation|action)\(\{([\s\S]*?)^\}\);/gm;
    const found: string[] = [];
    const ungated: string[] = [];
    for (const [path, source] of Object.entries(sources)) {
      for (const [, name, body] of source.matchAll(publicFunction)) {
        const id = `${path}:${name}`;
        found.push(id);
        const handler = body.slice(body.indexOf("handler:"));
        const firstStatement = handler.match(/=> \{\s*([^\n]*)/)?.[1];
        if (firstStatement !== "await requireMember(ctx);" && !UNGATED.has(id))
          ungated.push(id);
      }
    }
    // Guards the scan itself: a format change must not make this vacuous.
    expect(found.length).toBeGreaterThanOrEqual(16);
    expect(ungated).toEqual([]);
  });

  test("anonymous callers are refused before any work", async () => {
    const { anonymous, t, args } = await setup();
    const storyId = await t.mutation(api.stories.createFromSetup, args);
    const chapterId = await t.run(async (ctx) => {
      const chapter = await ctx.db
        .query("chapters")
        .withIndex("by_story", (q) => q.eq("storyId", storyId))
        .first();
      if (!chapter) throw new Error("no chapter");
      return chapter._id;
    });

    const refused = [
      () => anonymous.query(api.catalog.listChoices, {}),
      () => anonymous.query(api.stories.get, { storyId }),
      () => anonymous.query(api.stories.listByIds, { storyIds: [storyId] }),
      () => anonymous.mutation(api.stories.createFromSetup, args),
      () => anonymous.action(api.chapters.pitchChapter, { chapterId }),
      () =>
        anonymous.mutation(api.chapters.chooseBeat, { chapterId, cardId: "a" }),
      () => anonymous.action(api.chapters.writeChapter, { chapterId }),
      () => anonymous.mutation(api.chapters.lockChapter, { chapterId }),
      () => anonymous.mutation(api.exportJobs.retry, { storyId }),
      () => anonymous.action(api.epub.build.buildEpub, { storyId }),
      () => anonymous.action(api.heroIdeas.openSession, {}),
    ];
    for (const call of refused)
      await expect(call()).rejects.toThrow(SIGN_IN_REQUIRED);

    expect(
      await t.run(async (ctx) => ({
        stories: (await ctx.db.query("stories").collect()).length,
        sessions: (await ctx.db.query("heroIdeaSessions").collect()).length,
      })),
    ).toEqual({ stories: 1, sessions: 0 });
    await expect(
      anonymous.query(api.diagnostics.ping, {}),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("daily book limit", () => {
  test("allows ten new books per UTC day, then refuses until tomorrow", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T23:00:00Z"));
    const { t, args } = await setup();
    for (let book = 0; book < 10; book++)
      await t.mutation(api.stories.createFromSetup, args);
    await expect(t.mutation(api.stories.createFromSetup, args)).rejects.toThrow(
      LIBRARY_FULL,
    );

    vi.setSystemTime(new Date("2026-11-10T00:00:01Z"));
    await expect(
      t.mutation(api.stories.createFromSetup, args),
    ).resolves.toBeTruthy();
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query("stories").collect()).length,
      ),
    ).toBe(11);
  });

  test("DAILY_BOOK_LIMIT changes the cap without a deploy", async () => {
    vi.stubEnv("DAILY_BOOK_LIMIT", "1");
    const { t, args } = await setup();
    await t.mutation(api.stories.createFromSetup, args);
    await expect(t.mutation(api.stories.createFromSetup, args)).rejects.toThrow(
      LIBRARY_FULL,
    );
  });

  test("a refused setup does not use up the day's allowance", async () => {
    vi.stubEnv("DAILY_BOOK_LIMIT", "1");
    const { t, args } = await setup();
    await expect(
      t.mutation(api.stories.createFromSetup, {
        ...args,
        protagonistName: "  ",
      }),
    ).rejects.toThrow(/hero a name/);
    await expect(
      t.mutation(api.stories.createFromSetup, args),
    ).resolves.toBeTruthy();
  });
});

describe("recent stories", () => {
  test("returns only the requested stories, in the requested order", async () => {
    const { t, args } = await setup();
    const first = await t.mutation(api.stories.createFromSetup, args);
    const second = await t.mutation(api.stories.createFromSetup, {
      ...args,
      protagonistName: "Otto",
    });
    await t.mutation(api.stories.createFromSetup, {
      ...args,
      protagonistName: "Someone Else",
    });

    const shelf = await t.query(api.stories.listByIds, {
      storyIds: [second, "not-an-id", first],
    });
    expect(shelf.map((story) => story._id)).toEqual([second, first]);
    expect(Object.keys(shelf[0]).sort()).toEqual([
      "_id",
      "title",
      "totalChapters",
    ]);
  });

  test("refuses oversized requests", async () => {
    const { t } = await setup();
    await expect(
      t.query(api.stories.listByIds, {
        storyIds: Array.from({ length: 21 }, (_, index) => `id${index}`),
      }),
    ).rejects.toThrow(/Too many/);
  });
});
