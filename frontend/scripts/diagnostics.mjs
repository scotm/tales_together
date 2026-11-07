#!/usr/bin/env node
// Admin-only trace reader. The app has no operator identity, so inspection
// stays on the CLI:
//   node scripts/diagnostics.mjs trace <operationId> [--limit 50] [--cursor c]
//   node scripts/diagnostics.mjs recent [--story <storyId>] [--limit 25]
//   node scripts/diagnostics.mjs health [--limit 20]
//   node scripts/diagnostics.mjs purge --story <storyId> --confirm
// Add --prod for the hosted deployment.
import { spawnSync } from "node:child_process";

const [mode, ...rest] = process.argv.slice(2);

function parseFlags(args) {
  const flags = { prod: false, confirm: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--prod") flags.prod = true;
    else if (arg === "--confirm") flags.confirm = true;
    else if (arg === "--limit" || arg === "--cursor" || arg === "--story") {
      flags[arg.slice(2)] = args[index + 1];
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`unknown flag: ${arg}`);
    } else positional.push(arg);
  }
  if (flags.limit !== undefined) {
    const limit = Number(flags.limit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("--limit must be a positive integer");
    }
    flags.limit = limit;
  }
  return { flags, positional };
}

function run(functionName, args, prod) {
  const result = spawnSync(
    "npx",
    [
      "convex",
      "run",
      functionName,
      JSON.stringify(args),
      ...(prod ? ["--prod"] : []),
    ],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

function usage() {
  console.error(
    [
      "usage:",
      "  node scripts/diagnostics.mjs trace <operationId> [--limit 50] [--cursor <cursor>] [--prod]",
      "  node scripts/diagnostics.mjs recent [--story <storyId>] [--limit 25] [--cursor <cursor>] [--prod]",
      "  node scripts/diagnostics.mjs health [--limit 20] [--prod]",
      "  node scripts/diagnostics.mjs purge --story <storyId> --confirm [--limit 200] [--prod]",
    ].join("\n"),
  );
  process.exit(1);
}

let parsed;
try {
  parsed = parseFlags(rest);
} catch (error) {
  console.error(error.message);
  usage();
}

const { flags, positional } = parsed;

if (mode === "trace" && positional[0]) {
  run(
    "diagnostics:trace",
    {
      operationId: positional[0],
      paginationOpts: {
        numItems: flags.limit ?? 50,
        cursor: flags.cursor ?? null,
      },
    },
    flags.prod,
  );
} else if (mode === "recent") {
  run(
    "diagnostics:recent",
    {
      ...(flags.story ? { storyId: flags.story } : {}),
      paginationOpts: {
        numItems: flags.limit ?? 25,
        cursor: flags.cursor ?? null,
      },
    },
    flags.prod,
  );
} else if (mode === "health") {
  run("diagnostics:health", { limit: flags.limit ?? 20 }, flags.prod);
} else if (mode === "purge" && flags.story && flags.confirm) {
  run(
    "diagnostics:purgeStory",
    {
      storyId: flags.story,
      confirm: true,
      limit: flags.limit ?? 200,
    },
    flags.prod,
  );
} else {
  usage();
}
