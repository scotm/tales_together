#!/usr/bin/env node
// Admin-only trace reader. The app has no operator identity, so inspection
// stays on the CLI: node scripts/diagnostics.mjs trace <operationId>
// node scripts/diagnostics.mjs recent [--story <storyId>] [--prod]
import { spawnSync } from "node:child_process";

const [mode, value, ...rest] = process.argv.slice(2);

function run(functionName, args, extra) {
  const result = spawnSync(
    "npx",
    ["convex", "run", functionName, JSON.stringify(args), ...extra],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

if (mode === "trace" && value) {
  run("diagnostics:trace", { operationId: value }, rest);
} else if (mode === "recent") {
  const storyIndex = rest.indexOf("--story");
  const storyId = storyIndex === -1 ? undefined : rest[storyIndex + 1];
  const extra =
    storyIndex === -1
      ? rest
      : rest.filter(
          (entry, index) => entry !== "--story" && index !== storyIndex + 1,
        );
  run("diagnostics:recent", { storyId, limit: 25 }, extra);
} else {
  console.error(
    "usage: node scripts/diagnostics.mjs trace <operationId>\n" +
      "       node scripts/diagnostics.mjs recent [--story <storyId>] [--prod]",
  );
  process.exit(1);
}
