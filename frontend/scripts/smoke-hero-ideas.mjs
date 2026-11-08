/** Manual smoke test: spends bounded provider calls on a supplied synthetic clip; creates no book. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env.local")))
  process.loadEnvFile(join(root, ".env.local"));
const file = process.argv[2];
if (!file)
  throw new Error(
    "Pass a synthetic recording of an otter, blue cape, rainbow glasses and star hiccups.",
  );
const client = new ConvexHttpClient(
  process.env.CONVEX_SELF_HOSTED_URL ?? process.env.EXPO_PUBLIC_CONVEX_URL,
  { logger: false },
);
let stage = "session";
let capability;
const requests = [];
const started = Date.now();
const ref = makeFunctionReference;
try {
  ({ capability } = await client.action(ref("heroIdeas:openSession"), {}));
  stage = "transcription";
  const fileBytes = readFileSync(file);
  const audio = fileBytes.buffer.slice(
    fileBytes.byteOffset,
    fileBytes.byteOffset + fileBytes.byteLength,
  );
  const mimeType =
    extname(file) === ".webm"
      ? "audio/webm"
      : extname(file) === ".wav"
        ? "audio/wav"
        : "audio/mp4";
  const speechId = `speech_smoke_${Date.now()}`;
  requests.push(speechId);
  const text = await client.action(ref("speech:transcribe"), {
    capability,
    requestId: speechId,
    audio,
    mimeType,
  });
  const catalog = await client.query(ref("catalog:listChoices"), {});
  const choice = (key) => {
    const row = catalog.options.find((row) => row.key === key && row.active);
    if (!row) throw new Error("Missing smoke-test choice.");
    return { optionId: row.optionId, revision: row.revision };
  };
  stage = "interpretation";
  const ideaId = `idea_smoke_${Date.now()}`;
  requests.push(ideaId);
  const result = await client.action(ref("heroIdeas:prepare"), {
    capability,
    requestId: ideaId,
    text,
    source: "spoken",
    context: {
      character: choice("hero_otter"),
      outfit: choice("out_chef"),
      quirk: choice("quirk_bubbles"),
      kidGender: "open",
    },
  });
  const descriptions = result.parts
    .map((part) => part.description)
    .join(" ")
    .toLowerCase();
  const kept = {
    blueCape: descriptions.includes("blue") && descriptions.includes("cape"),
    rainbowGlasses:
      descriptions.includes("rainbow") && descriptions.includes("glass"),
    starHiccups:
      descriptions.includes("star") && descriptions.includes("hiccup"),
  };
  const passed = !result.clarification && Object.values(kept).every(Boolean);
  console.log(
    JSON.stringify(
      {
        passed,
        stage,
        elapsedMs: Date.now() - started,
        preserved: kept,
        changedParts: result.parts.map((part) => part.part),
        reviewStillRequired: true,
        createdBook: false,
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
} catch {
  // Never print capabilities, audio, transcripts, provider replies or credentials.
  console.error(
    JSON.stringify({ passed: false, stage, elapsedMs: Date.now() - started }),
  );
  process.exitCode = 1;
} finally {
  if (capability)
    for (const requestId of requests) {
      try {
        await client.mutation(ref("heroIdeaState:cancel"), {
          capability,
          requestId,
        });
      } catch {
        console.error(
          "Smoke-test cleanup did not finish; expiry cleanup remains enabled.",
        );
      }
    }
}
