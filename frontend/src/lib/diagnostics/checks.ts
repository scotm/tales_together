import { api } from "@convex/_generated/api";
import type { ConvexReactClient } from "convex/react";
import { classifyError } from "../../../shared/diagnostics/contract";
import type { CapabilityCheck } from "../../../shared/diagnostics/support";
import type { DiagnosticsApi } from "./DiagnosticsProvider";

const PROBE_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("connection probe timed out")),
      PROBE_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function probeHttp(client: ConvexReactClient): Promise<CapabilityCheck> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(new URL("/version", client.url), {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("version endpoint failed");
    return {
      name: "http_version",
      status: "succeeded",
      durationMs: Date.now() - startedAt,
      detail: `HTTP ${response.status}`,
    };
  } catch (cause) {
    const classified = classifyError(cause);
    return {
      name: "http_version",
      status: "failed",
      durationMs: Date.now() - startedAt,
      detail: classified.code,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeQuery(client: ConvexReactClient): Promise<CapabilityCheck> {
  const startedAt = Date.now();
  try {
    await withTimeout(client.query(api.diagnostics.ping, {}));
    return {
      name: "application_query",
      status: "succeeded",
      durationMs: Date.now() - startedAt,
      detail: "read-only round trip",
    };
  } catch (cause) {
    const classified = classifyError(cause);
    return {
      name: "application_query",
      status: "failed",
      durationMs: Date.now() - startedAt,
      detail: classified.code,
    };
  }
}

/**
 * HTTP and the Convex application round trip are separate observations: a
 * version response does not prove the live query path works.
 */
export async function checkConnection(
  client: ConvexReactClient,
  diagnostics: DiagnosticsApi,
): Promise<CapabilityCheck[]> {
  const results = [await probeHttp(client), await probeQuery(client)];
  for (const check of results) {
    diagnostics.record(`connection.probe_${check.name}`, {
      level: check.status === "failed" ? "warn" : "info",
      status: check.status === "failed" ? "failed" : "succeeded",
      stage: check.name,
      durationMs: check.durationMs,
      message: check.detail,
      errorCode:
        check.status === "failed"
          ? `CLIENT_PROBE_${check.name.toUpperCase()}`
          : undefined,
    });
    diagnostics.addCheck(check);
  }
  return results;
}
