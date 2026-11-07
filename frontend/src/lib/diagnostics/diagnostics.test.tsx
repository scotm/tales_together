/// <reference types="jest" />
import { DiagnosticBuffer } from "../../../shared/diagnostics/buffer";
import { createDiagnosticEvent } from "../../../shared/diagnostics/contract";
import {
  buildSupportBundle,
  redactOrigin,
} from "../../../shared/diagnostics/support";

it("bounds the client timeline by count and byte budget", () => {
  const buffer = new DiagnosticBuffer(2, 1024 * 1024);
  for (let index = 0; index < 4; index += 1) {
    buffer.add({
      name: "query.first_result",
      level: "info",
      source: "web",
      message: String(index),
    });
  }
  expect(buffer.size).toBe(2);
  expect(buffer.list().map((event) => event.message)).toEqual(["2", "3"]);
});

it("exports a support bundle without story capabilities or private hosts", () => {
  const event = createDiagnosticEvent({
    name: "operation.failed",
    level: "error",
    source: "web",
    storyId: "story_capability",
    chapterId: "chapter_capability",
    message: "fetch failed for https://example.test/story",
  });
  if (!event) throw new Error("event rejected");
  const bundle = buildSupportBundle({
    sessionId: "session-1",
    identity: {
      appVersion: "0.1.0",
      buildId: "build-1",
      platform: "web",
      osVersion: "ios",
      runtime: "Safari/18",
    },
    connection: {
      configuredOrigin: "http://localhost:3210",
      effectiveOrigin: "http://localhost:3210",
      websocketConnected: false,
      reconnectCount: 1,
      connectionRetries: 2,
      pendingMutations: 1,
      pendingActions: 0,
    },
    checks: [],
    events: [event],
  });
  expect(bundle.events[0]).not.toHaveProperty("storyId");
  expect(bundle.events[0]).not.toHaveProperty("chapterId");
  expect(bundle.events[0]?.message).not.toContain("example.test");
  expect(bundle.connection.effectiveOrigin).toBe("http://<private-host>");
  expect(redactOrigin("https://story.example.com")).toBe(
    "https://story.example.com",
  );
});
