import type { DiagnosticEvent } from "./contract";

export interface SupportIdentity {
  appVersion: string;
  buildId: string;
  platform: string;
  osVersion: string;
  runtime: string;
  route?: string;
}

export interface ConnectionSummary {
  configuredOrigin?: string;
  effectiveOrigin?: string;
  loopbackCorrected?: boolean;
  websocketConnected: boolean;
  firstConnectedAt?: number;
  lastConnectedAt?: number;
  reconnectCount: number;
  connectionRetries: number;
  pendingMutations: number;
  pendingActions: number;
}

export interface CapabilityCheck {
  name: string;
  status: "succeeded" | "failed" | "skipped";
  durationMs?: number;
  detail?: string;
}

export interface SupportBundle {
  schemaVersion: 1;
  generatedAt: number;
  sessionId: string;
  identity: SupportIdentity;
  connection: ConnectionSummary;
  checks: CapabilityCheck[];
  operations: string[];
  events: DiagnosticEvent[];
  notes: string[];
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|.*\.local$)/i;

export function redactOrigin(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    if (PRIVATE_HOST.test(url.hostname)) {
      return `${url.protocol}//<private-host>`;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}

/** Support bundles never carry story capabilities, prompts or content. */
export function sanitizeEvent(event: DiagnosticEvent): DiagnosticEvent {
  const {
    storyId: _storyId,
    chapterId: _chapterId,
    traceId: _traceId,
    ...safe
  } = event;
  return {
    ...safe,
    message: safe.message
      ?.replace(/https?:\/\/[^\s]+/g, "<url>")
      .replace(/file:\/\/[^\s]+/g, "<path>"),
  };
}

export function buildSupportBundle(input: {
  sessionId: string;
  identity: SupportIdentity;
  connection: ConnectionSummary;
  checks: CapabilityCheck[];
  events: DiagnosticEvent[];
  generatedAt?: number;
}): SupportBundle {
  const operations = [
    ...new Set(
      input.events
        .map((event) => event.operationId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? Date.now(),
    sessionId: input.sessionId,
    identity: {
      ...input.identity,
      route: input.identity.route,
    },
    connection: {
      ...input.connection,
      configuredOrigin: redactOrigin(input.connection.configuredOrigin),
      effectiveOrigin: redactOrigin(input.connection.effectiveOrigin),
    },
    checks: input.checks,
    operations,
    events: input.events.map(sanitizeEvent),
    notes: [
      "Server evidence is missing while the backend is unreachable.",
      "Story links, chapter text, prompts, credentials and file paths are excluded.",
    ],
  };
}

export function supportSummary(bundle: SupportBundle): string {
  const lines = [
    `Tales Together diagnostics (schema ${bundle.schemaVersion})`,
    `Generated: ${new Date(bundle.generatedAt).toISOString()}`,
    `Session: ${bundle.sessionId}`,
    `Build: ${bundle.identity.appVersion} (${bundle.identity.buildId})`,
    `Platform: ${bundle.identity.platform} ${bundle.identity.osVersion} · ${bundle.identity.runtime}`,
    bundle.identity.route ? `Route: ${bundle.identity.route}` : undefined,
    `Backend: ${bundle.connection.effectiveOrigin ?? "not configured"}`,
    `Connected: ${bundle.connection.websocketConnected ? "yes" : "no"}`,
    bundle.connection.lastConnectedAt
      ? `Last connected: ${new Date(bundle.connection.lastConnectedAt).toISOString()}`
      : "Last connected: never this launch",
    `Pending: ${bundle.connection.pendingMutations} writes, ${bundle.connection.pendingActions} actions`,
    `Reconnects: ${bundle.connection.reconnectCount} (${bundle.connection.connectionRetries} retries)`,
    ...bundle.checks.map(
      (check) =>
        `Check ${check.name}: ${check.status}${check.detail ? ` · ${check.detail}` : ""}`,
    ),
    `Events: ${bundle.events.length}`,
    bundle.operations.length > 0
      ? `Operations: ${bundle.operations.slice(-10).join(", ")}`
      : "Operations: none recorded",
    ...bundle.events
      .slice(-8)
      .map(
        (event) =>
          `${new Date(event.timestamp).toISOString()} ${event.level} ${event.name}${event.errorCode ? ` ${event.errorCode}` : ""}`,
      ),
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}
