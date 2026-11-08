import { describe, expect, it } from "vitest";
import { DiagnosticBuffer } from "../../shared/diagnostics/buffer";
import {
  classifyError,
  createDiagnosticEvent,
} from "../../shared/diagnostics/contract";
import {
  createDiagnosticLogger,
  createTestSink,
} from "../../shared/diagnostics/logger";
import {
  buildSupportBundle,
  redactOrigin,
} from "../../shared/diagnostics/support";
import { ProviderRequestError } from "../llm/request";

describe("diagnostic contract", () => {
  it("accepts only allowlisted event families and bounded strings", () => {
    expect(
      createDiagnosticEvent({
        name: "operation.started",
        level: "info",
        source: "convex",
      }),
    ).not.toBeNull();
    expect(
      createDiagnosticEvent({
        name: "render.count",
        level: "info",
        source: "web",
      }),
    ).toBeNull();
    expect(
      createDiagnosticEvent({
        name: "operation.failed",
        level: "info",
        source: "web",
        message: "x".repeat(10_000),
      })?.message?.length,
    ).toBeLessThanOrEqual(500);
  });

  it("names a missing setting without leaking its value", () => {
    const classified = classifyError(
      new Error("GEMINI_API_KEY is not set (value secret-value)"),
    );
    expect(classified).toMatchObject({
      code: "CONFIG_MISSING",
      retryable: false,
    });
    expect(classified.safeMessage).toContain("GEMINI_API_KEY");
    expect(classified.safeMessage).not.toContain("secret-value");
  });

  it("classifies provider status without retaining the body", () => {
    const classified = classifyError(
      new ProviderRequestError("gemini 429: prompt text", true, 0, {
        code: "PROVIDER_RATE_LIMITED",
        status: 429,
      }),
    );
    expect(classified.code).toBe("PROVIDER_RATE_LIMITED");
    expect(classified.safeMessage).not.toMatch(/gemini|prompt/);
  });
});

describe("diagnostic buffer and sinks", () => {
  it("keeps the newest events inside both budgets", () => {
    const buffer = new DiagnosticBuffer(3, 1024 * 1024);
    for (let index = 0; index < 5; index += 1) {
      buffer.add({
        name: "operation.tick",
        level: "info",
        source: "web",
        message: String(index),
      });
    }
    expect(buffer.size).toBe(3);
    expect(buffer.list().map((event) => event.message)).toEqual([
      "2",
      "3",
      "4",
    ]);
  });

  it("a broken sink never throws into the observed code", () => {
    const logger = createDiagnosticLogger([
      {
        emit() {
          throw new Error("sink down");
        },
      },
      createTestSink(),
    ]);
    expect(() =>
      logger.record({
        name: "operation.started",
        level: "info",
        source: "convex",
      }),
    ).not.toThrow();
  });
});

describe("support bundle privacy", () => {
  it("drops story capabilities and redacts private origins", () => {
    const event = createDiagnosticEvent({
      name: "operation.failed",
      level: "error",
      source: "web",
      storyId: "story_capability",
      chapterId: "chapter_capability",
      message: "see https://example.test/private and file:///Users/child/book",
    });
    if (!event) throw new Error("event rejected");
    const bundle = buildSupportBundle({
      sessionId: "session-1",
      identity: {
        appVersion: "0.1.0",
        buildId: "build-1",
        platform: "web",
        osVersion: "macos",
        runtime: "Safari/18",
      },
      connection: {
        configuredOrigin: "http://192.168.1.4:3210",
        effectiveOrigin: "http://192.168.1.4:3210",
        websocketConnected: false,
        reconnectCount: 0,
        connectionRetries: 0,
        pendingMutations: 0,
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
});
