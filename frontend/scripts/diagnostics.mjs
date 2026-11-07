#!/usr/bin/env node
// Admin-only trace, usage and reconciliation CLI. The app has no operator
// identity, so inspection stays on the CLI:
//   node scripts/diagnostics.mjs trace <operationId> [--limit 50] [--cursor c]
//   node scripts/diagnostics.mjs recent [--story <storyId>] [--limit 25]
//   node scripts/diagnostics.mjs health [--limit 20]
//   node scripts/diagnostics.mjs usage [--since ISO] [--until ISO] [--limit 1000]
//   node scripts/diagnostics.mjs metrics [--since ISO] [--until ISO] [--limit 1000]
//   node scripts/diagnostics.mjs baseline
//   node scripts/diagnostics.mjs reconcile --provider gemini --request-id ID --state charged --settled-micro-usd 1200
//   node scripts/diagnostics.mjs purge --story <storyId> --confirm
// Add --prod for the hosted deployment.
import { spawnSync } from "node:child_process";

const [mode, ...rest] = process.argv.slice(2);

function parseTime(value, flag) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && value.trim() !== "") return numeric;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new Error(`${flag} must be a timestamp or ISO date`);
  return parsed;
}

function parseFlags(args) {
  const flags = { prod: false, confirm: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--prod") flags.prod = true;
    else if (arg === "--confirm") flags.confirm = true;
    else if (
      arg === "--limit" ||
      arg === "--cursor" ||
      arg === "--story" ||
      arg === "--provider" ||
      arg === "--request-id" ||
      arg === "--state" ||
      arg === "--settled-micro-usd" ||
      arg === "--currency" ||
      arg === "--note" ||
      arg === "--since" ||
      arg === "--until"
    ) {
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
  if (flags["settled-micro-usd"] !== undefined) {
    const cost = Number(flags["settled-micro-usd"]);
    if (!Number.isInteger(cost) || cost < 0) {
      throw new Error("--settled-micro-usd must be a non-negative integer");
    }
    flags["settled-micro-usd"] = cost;
  }
  if (flags.since !== undefined)
    flags.since = parseTime(flags.since, "--since");
  if (flags.until !== undefined)
    flags.until = parseTime(flags.until, "--until");
  return { flags, positional };
}

function spawn(functionName, args, prod) {
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
  return result.status ?? 1;
}

function run(functionName, args, prod) {
  process.exit(spawn(functionName, args, prod));
}

function windowArgs(flags) {
  return {
    ...(flags.since === undefined ? {} : { since: flags.since }),
    ...(flags.until === undefined ? {} : { until: flags.until }),
    limit: flags.limit ?? 1_000,
  };
}

function usage() {
  console.error(
    [
      "usage:",
      "  node scripts/diagnostics.mjs trace <operationId> [--limit 50] [--cursor <cursor>] [--prod]",
      "  node scripts/diagnostics.mjs recent [--story <storyId>] [--limit 25] [--cursor <cursor>] [--prod]",
      "  node scripts/diagnostics.mjs health [--limit 20] [--prod]",
      "  node scripts/diagnostics.mjs usage [--since <ISO>] [--until <ISO>] [--limit 1000] [--prod]",
      "  node scripts/diagnostics.mjs metrics [--since <ISO>] [--until <ISO>] [--limit 1000] [--prod]",
      "  node scripts/diagnostics.mjs baseline [--prod]",
      "  node scripts/diagnostics.mjs reconcile --provider <p> --request-id <id> --state charged|not_charged|unknown [--settled-micro-usd <n>] [--currency USD] [--note <text>] [--prod]",
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
} else if (mode === "usage") {
  run("diagnostics:usage", windowArgs(flags), flags.prod);
} else if (mode === "metrics") {
  run("diagnostics:metrics", windowArgs(flags), flags.prod);
} else if (mode === "baseline") {
  const codes = [
    spawn("diagnostics:health", { limit: flags.limit ?? 20 }, flags.prod),
    spawn("diagnostics:usage", windowArgs(flags), flags.prod),
    spawn("diagnostics:metrics", windowArgs(flags), flags.prod),
  ];
  process.exit(codes.find((code) => code !== 0) ?? 0);
} else if (
  mode === "reconcile" &&
  flags.provider &&
  flags["request-id"] &&
  flags.state
) {
  run(
    "diagnostics:reconcileReceipt",
    {
      provider: flags.provider,
      requestId: flags["request-id"],
      settlementState: flags.state,
      ...(flags["settled-micro-usd"] === undefined
        ? {}
        : { settledCostMicroUsd: flags["settled-micro-usd"] }),
      ...(flags.currency ? { currency: flags.currency } : {}),
      ...(flags.note ? { note: flags.note } : {}),
    },
    flags.prod,
  );
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
