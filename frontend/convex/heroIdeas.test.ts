/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  IDEA_DAILY_UNITS,
  IDEA_SESSION_WINDOW_UNITS,
} from "./lib/heroIdeaConfig";
import { createFakeProvider, getTextProvider } from "./llm/provider";
import schema from "./schema";

vi.mock("./llm/provider", async (original) => ({
  ...(await original<typeof import("./llm/provider")>()),
  getTextProvider: vi.fn(),
}));
const modules = import.meta.glob("./**/*.ts");
// Invited Clerk guests are the only callers of public functions.
const guest = { subject: "user_guest" };
const text = "A blue cape, rainbow glasses and hiccups that make stars.";
const patch = [
  {
    part: "outfit" as const,
    label: "Blue cape",
    description: "wearing a blue cape",
  },
  {
    part: "details" as const,
    label: "Rainbow glasses",
    description: "wearing rainbow glasses",
  },
  {
    part: "quirk" as const,
    label: "Star hiccups",
    description: "Hiccups harmless stars",
  },
];
let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(getTextProvider).mockReset();
  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => consoleSpy.mockRestore());
async function setup() {
  const t = convexTest(schema, modules).withIdentity(guest);
  await t.mutation(internal.migrations.seedCatalog, {});
  const options = (await t.query(api.catalog.listChoices, {})).options;
  const ref = (key: string) => {
    const row = options.find((row) => row.key === key);
    if (!row) throw new Error("Missing choice");
    return { optionId: row.optionId, revision: row.revision };
  };
  const { capability } = await t.action(api.heroIdeas.openSession, {});
  const context = {
    character: ref("hero_otter"),
    outfit: ref("out_chef"),
    quirk: ref("quirk_bubbles"),
    kidGender: "open" as const,
  };
  const input = {
    capability,
    requestId: "request_1234567890",
    context,
    text,
    source: "typed" as const,
  };
  const fake = createFakeProvider([
    '{"safe":true}',
    JSON.stringify({ parts: patch, clarification: "" }),
    '{"safe":true}',
  ]);
  vi.mocked(getTextProvider).mockReturnValue(fake.provider);
  return { t, capability, context, input, ref, fake };
}
test("prepares only the requested patch, keeps raw text private until confirmation and snapshots confirmed parts", async () => {
  const { t, input, context, capability, ref, fake } = await setup();
  const result = await t.action(api.heroIdeas.prepare, input);
  expect(result.parts).toEqual(patch);
  expect(fake.calls[1]?.request.system).not.toContain(text);
  expect(fake.calls[1]?.request.user).toContain(text);
  const prepared = await t.run((ctx) => ctx.db.get(result.ideaId));
  expect(prepared?.state).toBe("READY");
  expect(prepared?.confirmedText).toBeUndefined();
  const session = await t.run((ctx) =>
    ctx.db.query("heroIdeaSessions").first(),
  );
  expect(session?.tokenHash).not.toBe(capability);
  const confirmed = await t.mutation(api.heroIdeaState.confirm, {
    capability,
    ideaId: result.ideaId,
    context,
    text,
  });
  expect(confirmed).toEqual(patch);
  const custom = (part: "outfit" | "quirk" | "details") => ({
    kind: "custom" as const,
    ideaId: result.ideaId,
    part,
  });
  const storyId = await t.mutation(api.stories.createFromSetup, {
    setting: ref("set_museum"),
    problem: ref("prob_map"),
    character: context.character,
    outfit: custom("outfit"),
    quirk: custom("quirk"),
    details: custom("details"),
    ideaCapability: capability,
    protagonistName: "Mira",
    kidGender: "open",
    packed: [ref("item_whisk"), ref("item_jam"), ref("item_kazoo")],
  });
  const book = await t.query(api.stories.get, { storyId });
  expect(book?.characters[0]?.visualDescription).toContain(
    "wearing a blue cape wearing rainbow glasses",
  );
  expect(book?.characters[0]?.quirk).toBe("Hiccups harmless stars");
  expect(book?.characters[0]?.setupChoices?.details).toMatchObject({
    kind: "custom",
    description: "wearing rainbow glasses",
    confirmedText: text,
  });
  expect((await t.query(api.catalog.listChoices, {})).options).toHaveLength(62);
  await t.run((ctx) =>
    ctx.db.patch(result.ideaId, { expiresAt: Date.now() - 1 }),
  );
  await t.mutation(internal.heroIdeaState.cleanup, {});
  expect(await t.query(api.stories.get, { storyId })).toEqual(book);
});
test("same request is idempotent and cannot be replayed with different text", async () => {
  const { t, input, fake } = await setup();
  const first = await t.action(api.heroIdeas.prepare, input);
  expect(await t.action(api.heroIdeas.prepare, input)).toMatchObject({
    ideaId: first.ideaId,
    parts: patch,
  });
  expect(fake.calls).toHaveLength(3);
  await expect(
    t.action(api.heroIdeas.prepare, { ...input, text: "Different text" }),
  ).rejects.toThrow(/new idea request/);
});
test("private capabilities, changed bases and altered confirmed words are rejected", async () => {
  const { t, input, ref } = await setup();
  const result = await t.action(api.heroIdeas.prepare, input);
  const confirm = {
    capability: input.capability,
    ideaId: result.ideaId,
    context: input.context,
    text,
  };
  await expect(
    t.mutation(api.heroIdeaState.confirm, {
      ...confirm,
      capability: "a".repeat(64),
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.heroIdeaState.confirm, {
      ...confirm,
      context: { ...input.context, character: ref("hero_alien") },
    }),
  ).rejects.toThrow(/hero changed/);
  await expect(
    t.mutation(api.heroIdeaState.confirm, {
      ...confirm,
      text: "unreviewed text",
    }),
  ).rejects.toThrow(/hero changed/);
});
test("input and output moderation fail closed without storing rejected content", async () => {
  const { t, input } = await setup();
  const unsafe = createFakeProvider(['{"safe":false}']);
  vi.mocked(getTextProvider).mockReturnValue(unsafe.provider);
  await expect(t.action(api.heroIdeas.prepare, input)).rejects.toThrow(
    /safe story idea/,
  );
  expect(unsafe.calls).toHaveLength(1);
  const rows = await t.run((ctx) => ctx.db.query("heroIdeas").collect());
  expect(rows[0]).toMatchObject({ state: "REJECTED" });
  expect(rows[0]?.parts).toBeUndefined();
  expect(JSON.stringify(rows)).not.toContain(text);
  const output = createFakeProvider([
    '{"safe":true}',
    JSON.stringify({ parts: patch, clarification: "" }),
    '{"safe":false}',
  ]);
  vi.mocked(getTextProvider).mockReturnValue(output.provider);
  await expect(
    t.action(api.heroIdeas.prepare, {
      ...input,
      requestId: "request_2234567890",
    }),
  ).rejects.toThrow(/safe story idea/);
});
test("strict parsing and provider errors do not expose provider output or leave a pending request", async () => {
  const { t, input } = await setup();
  const fake = createFakeProvider(['{"safe":true}', "SECRET_PROVIDER_OUTPUT"]);
  vi.mocked(getTextProvider).mockReturnValue(fake.provider);
  await expect(t.action(api.heroIdeas.prepare, input)).rejects.toThrow(
    /words are kept/,
  );
  expect((await t.run((ctx) => ctx.db.query("heroIdeas").first()))?.state).toBe(
    "FAILED",
  );
  expect(consoleSpy.mock.calls.flat().join()).not.toContain(
    "SECRET_PROVIDER_OUTPUT",
  );
});
test("cancellation before claim or during interpretation prevents late publication", async () => {
  const { t, input } = await setup();
  await t.mutation(api.heroIdeaState.cancel, {
    capability: input.capability,
    requestId: input.requestId,
  });
  await expect(t.action(api.heroIdeas.prepare, input)).rejects.toThrow();
  let finish!: (raw: string) => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  let calls = 0;
  vi.mocked(getTextProvider).mockReturnValue({
    name: "fake",
    complete: async () => {
      calls++;
      if (calls === 1) return '{"safe":true}';
      began();
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    },
  });
  const requestId = "request_3234567890";
  const pending = expect(
    t.action(api.heroIdeas.prepare, { ...input, requestId }),
  ).rejects.toThrow(/words are kept/);
  await started;
  await t.mutation(api.heroIdeaState.cancel, {
    capability: input.capability,
    requestId,
  });
  finish(JSON.stringify({ parts: patch, clarification: "" }));
  await pending;

  const rows = await t.run((ctx) => ctx.db.query("heroIdeas").collect());
  expect(rows.every((row) => row.state === "CANCELLED" && !row.parts)).toBe(
    true,
  );
});
test("session/deployment limits are atomic and cannot be bypassed with new request IDs", async () => {
  const { t, input } = await setup();
  await t.run(async (ctx) => {
    const session = await ctx.db.query("heroIdeaSessions").first();
    if (session)
      await ctx.db.patch(session._id, { units: IDEA_SESSION_WINDOW_UNITS });
  });
  await expect(t.action(api.heroIdeas.prepare, input)).rejects.toThrow(
    /lots of ideas/,
  );
  await t.run(async (ctx) => {
    const session = await ctx.db.query("heroIdeaSessions").first();
    if (session) await ctx.db.patch(session._id, { units: 0 });
    const quota = await ctx.db.query("heroIdeaQuota").first();
    if (quota) await ctx.db.patch(quota._id, { units: IDEA_DAILY_UNITS });
  });
  await expect(t.action(api.heroIdeas.prepare, input)).rejects.toThrow(
    /today’s limit/,
  );
});
test("expired requests cannot confirm and bounded expiry cleanup removes them", async () => {
  const { t, input } = await setup();
  const result = await t.action(api.heroIdeas.prepare, input);
  await t.run((ctx) =>
    ctx.db.patch(result.ideaId, { expiresAt: Date.now() - 1 }),
  );
  await expect(
    t.mutation(api.heroIdeaState.confirm, {
      capability: input.capability,
      context: input.context,
      text,
      ideaId: result.ideaId,
    }),
  ).rejects.toThrow(/expired/);
  expect(await t.mutation(internal.heroIdeaState.cleanup, {})).toBe(1);
});
