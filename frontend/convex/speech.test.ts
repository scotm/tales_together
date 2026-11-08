/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import recordings from "./speech/fixtures/recordings.json";
import { transcribeAudio } from "./speech/transcribe";

vi.mock("./speech/transcribe", () => ({ transcribeAudio: vi.fn() }));
const modules = import.meta.glob("./**/*.ts");
let logger: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.mocked(transcribeAudio)
    .mockReset()
    .mockResolvedValue("An otter with rainbow glasses.");
  logger = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => logger.mockRestore());
async function setup() {
  const t = convexTest(schema, modules);
  const { capability } = await t.action(api.heroIdeas.openSession, {});
  const audio = Uint8Array.from(atob(recordings.m4a), (char) =>
    char.charCodeAt(0),
  ).buffer;
  return {
    t,
    input: {
      capability,
      audio,
      mimeType: "audio/mp4",
      requestId: "speech_1234567890",
    },
  };
}
test("transcribes one validated recording without retaining audio or raw transcript", async () => {
  const { t, input } = await setup();
  expect(await t.action(api.speech.transcribe, input)).toBe(
    "An otter with rainbow glasses.",
  );
  expect(transcribeAudio).toHaveBeenCalledTimes(1);
  const rows = await t.run((ctx) => ctx.db.query("heroIdeas").collect());
  expect(rows[0]).toMatchObject({ kind: "speech", state: "READY" });
  expect(JSON.stringify(rows)).not.toContain("rainbow glasses");
  expect(JSON.stringify(rows)).not.toContain(recordings.m4a);
  await expect(t.action(api.speech.transcribe, input)).rejects.toThrow(
    /already sent/,
  );
  expect(transcribeAudio).toHaveBeenCalledTimes(1);
});
test("invalid MIME/bytes and forged capabilities do not reach the provider", async () => {
  const { t, input } = await setup();
  await expect(
    t.action(api.speech.transcribe, { ...input, mimeType: "audio/webm" }),
  ).rejects.toThrow(/did not match/);
  await expect(
    t.action(api.speech.transcribe, { ...input, capability: "f".repeat(64) }),
  ).rejects.toThrow(/session expired/);
  expect(transcribeAudio).not.toHaveBeenCalled();
});
test("cancelled transcription cannot return late words or overwrite the request state", async () => {
  const { t, input } = await setup();
  let finish!: (text: string) => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  vi.mocked(transcribeAudio).mockImplementation(() => {
    began();
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  });
  const pending = expect(
    t.action(api.speech.transcribe, input),
  ).rejects.toThrow(/words are kept/);
  await started;
  await t.mutation(api.heroIdeaState.cancel, {
    capability: input.capability,
    requestId: input.requestId,
  });
  finish("A late transcript.");
  await pending;
  expect((await t.run((ctx) => ctx.db.query("heroIdeas").first()))?.state).toBe(
    "CANCELLED",
  );
});
