// Runtime-neutral diagnostics contract. Both the Expo app and Convex import
// this file, so nothing here may touch Node, React, or a browser global.

export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;
export const MAX_EVENT_BYTES = 4 * 1024;
export const MAX_STRING = 500;

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export type DiagnosticSource = "web" | "ios" | "android" | "convex" | "node";

export type DiagnosticStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "degraded"
  | "skipped"
  | "superseded"
  | "recovered";

export type DiagnosticCostBasis =
  | "reported"
  | "estimated"
  | "settled"
  | "unknown";

export interface DiagnosticUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costMicroUsd?: number;
  currency?: string;
  costBasis?: DiagnosticCostBasis;
}

export interface DiagnosticEvent {
  schemaVersion: typeof DIAGNOSTIC_SCHEMA_VERSION;
  eventId: string;
  name: string;
  level: DiagnosticLevel;
  source: DiagnosticSource;
  timestamp: number;
  sequence?: number;
  sessionId?: string;
  traceId?: string;
  operationId?: string;
  parentOperationId?: string;
  runId?: string;
  callId?: string;
  attempt?: number;
  appVersion?: string;
  buildId?: string;
  deploymentId?: string;
  environment?: string;
  platform?: string;
  osVersion?: string;
  route?: string;
  stage?: string;
  status?: DiagnosticStatus;
  errorCode?: string;
  message?: string;
  retryable?: boolean;
  durationMs?: number;
  provider?: string;
  model?: string;
  purpose?: string;
  httpStatus?: number;
  requestId?: string;
  usage?: DiagnosticUsage;
  storyId?: string;
  chapterId?: string;
}

export type DiagnosticEventInput = Omit<
  DiagnosticEvent,
  "schemaVersion" | "eventId" | "timestamp"
> & {
  eventId?: string;
  timestamp?: number;
};

const NAME_FAMILIES = [
  "connection",
  "query",
  "operation",
  "provider.attempt",
  "job",
  "media",
  "export",
  "delivery",
  "diagnostics",
];

const NAME_PATTERN = new RegExp(
  `^(${NAME_FAMILIES.map((family) => family.replace(/\./g, "\\.")).join("|")})\\.[a-z0-9_.-]+$`,
);

const LEVELS: DiagnosticLevel[] = ["debug", "info", "warn", "error"];
const SOURCES: DiagnosticSource[] = ["web", "ios", "android", "convex", "node"];
const STATUSES: DiagnosticStatus[] = [
  "started",
  "succeeded",
  "failed",
  "degraded",
  "skipped",
  "superseded",
  "recovered",
];
const COST_BASES: DiagnosticCostBasis[] = [
  "reported",
  "estimated",
  "settled",
  "unknown",
];

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const ROUTE_PATTERN = /^\/[A-Za-z0-9_[\]/.:-]{0,199}$/;

function text(value: unknown, limit = MAX_STRING): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/[\r\n\t]+/g, " ").trim();
  return clean ? clean.slice(0, limit) : undefined;
}

function id(value: unknown): string | undefined {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) return undefined;
  return value;
}

function finite(value: unknown, min = 0): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= min ? value : undefined;
}

function usage(value: unknown): DiagnosticUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const result: DiagnosticUsage = {
    inputTokens: finite(raw.inputTokens),
    outputTokens: finite(raw.outputTokens),
    totalTokens: finite(raw.totalTokens),
    costMicroUsd: finite(raw.costMicroUsd),
    currency: text(raw.currency, 8)?.toUpperCase(),
    costBasis: COST_BASES.includes(raw.costBasis as DiagnosticCostBasis)
      ? (raw.costBasis as DiagnosticCostBasis)
      : undefined,
  };
  const kept = Object.fromEntries(
    Object.entries(result).filter(([, entry]) => entry !== undefined),
  );
  return Object.keys(kept).length > 0 ? (kept as DiagnosticUsage) : undefined;
}

export function eventBytes(event: DiagnosticEvent): number {
  // Two bytes per code unit is a safe upper bound for UTF-8 and needs no
  // TextEncoder, which not every JavaScript runtime exposes.
  return JSON.stringify(event).length * 2;
}

let counter = 0;

export function createEventId(prefix = "evt"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Returns a bounded, allowlisted event or null when identity is missing. */
export function createDiagnosticEvent(
  input: DiagnosticEventInput,
): DiagnosticEvent | null {
  if (!NAME_PATTERN.test(input.name)) return null;
  if (!LEVELS.includes(input.level)) return null;
  if (!SOURCES.includes(input.source)) return null;

  const event: DiagnosticEvent = {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    eventId: id(input.eventId) ?? createEventId(),
    name: input.name,
    level: input.level,
    source: input.source,
    timestamp:
      typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
        ? input.timestamp
        : Date.now(),
    sequence: finite(input.sequence),
    sessionId: id(input.sessionId),
    traceId: id(input.traceId),
    operationId: id(input.operationId),
    parentOperationId: id(input.parentOperationId),
    runId: id(input.runId),
    callId: id(input.callId),
    attempt: finite(input.attempt, 1),
    appVersion: text(input.appVersion, 32),
    buildId: text(input.buildId, 64),
    deploymentId: text(input.deploymentId, 64),
    environment: text(input.environment, 32),
    platform: text(input.platform, 32),
    osVersion: text(input.osVersion, 32),
    route:
      input.route && ROUTE_PATTERN.test(input.route) ? input.route : undefined,
    stage: text(input.stage, 64),
    status: STATUSES.includes(input.status as DiagnosticStatus)
      ? (input.status as DiagnosticStatus)
      : undefined,
    errorCode:
      input.errorCode && ERROR_CODE_PATTERN.test(input.errorCode)
        ? input.errorCode
        : undefined,
    message: text(input.message),
    retryable:
      typeof input.retryable === "boolean" ? input.retryable : undefined,
    durationMs: finite(input.durationMs),
    provider: text(input.provider, 64),
    model: text(input.model, 96),
    purpose: text(input.purpose, 32),
    httpStatus: finite(input.httpStatus, 100),
    requestId: id(input.requestId),
    usage: usage(input.usage),
    storyId: id(input.storyId),
    chapterId: id(input.chapterId),
  };

  return eventBytes(event) <= MAX_EVENT_BYTES ? event : null;
}

export function isDiagnosticEvent(value: unknown): value is DiagnosticEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<DiagnosticEvent>;
  return (
    event.schemaVersion === DIAGNOSTIC_SCHEMA_VERSION &&
    typeof event.eventId === "string" &&
    typeof event.name === "string" &&
    NAME_PATTERN.test(event.name) &&
    typeof event.level === "string" &&
    LEVELS.includes(event.level as DiagnosticLevel) &&
    typeof event.source === "string" &&
    SOURCES.includes(event.source as DiagnosticSource) &&
    typeof event.timestamp === "number" &&
    Number.isFinite(event.timestamp) &&
    eventBytes(event as DiagnosticEvent) <= MAX_EVENT_BYTES
  );
}

export interface ClassifiedError {
  code: string;
  retryable: boolean;
  safeMessage: string;
  httpStatus?: number;
}

interface ErrorShape {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  retryable?: unknown;
  status?: unknown;
}

/**
 * Classifies at the boundary that has context. The returned message is safe to
 * store: it never repeats provider bodies, prompts, URLs or file paths.
 */
export function classifyError(error: unknown): ClassifiedError {
  const shape: ErrorShape =
    typeof error === "object" && error !== null
      ? (error as ErrorShape)
      : { message: String(error) };
  const message = typeof shape.message === "string" ? shape.message : "";
  const status = finite(shape.status, 100);

  if (typeof shape.code === "string" && ERROR_CODE_PATTERN.test(shape.code)) {
    return {
      code: shape.code,
      retryable: shape.retryable === true,
      safeMessage: safeMessageFor(shape.code),
      httpStatus: status,
    };
  }

  const missing = message.match(/\b([A-Z][A-Z0-9_]{2,}) is not set\b/);
  if (missing) {
    return {
      code: "CONFIG_MISSING",
      retryable: false,
      safeMessage: `${missing[1]} is not set.`,
    };
  }
  if (message.includes("must be") || message.includes("cannot be empty")) {
    return {
      code: "CONFIG_INVALID",
      retryable: false,
      safeMessage: safeMessageFor("CONFIG_INVALID"),
    };
  }

  if (shape.name === "ProviderRequestError") {
    return {
      code: status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_HTTP_ERROR",
      retryable: shape.retryable === true,
      safeMessage: safeMessageFor(
        status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_HTTP_ERROR",
      ),
      httpStatus: status,
    };
  }

  if (message.includes("timed out")) {
    return {
      code: "PROVIDER_TIMEOUT",
      retryable: true,
      safeMessage: safeMessageFor("PROVIDER_TIMEOUT"),
    };
  }
  if (message.includes("returned no text") || message.includes("no bytes")) {
    return {
      code: "PROVIDER_EMPTY_RESPONSE",
      retryable: false,
      safeMessage: safeMessageFor("PROVIDER_EMPTY_RESPONSE"),
    };
  }
  if (message.includes("response was not JSON")) {
    return {
      code: "PROVIDER_INVALID_JSON",
      retryable: false,
      safeMessage: safeMessageFor("PROVIDER_INVALID_JSON"),
    };
  }
  if (
    message.startsWith("bad beat pitch:") ||
    message.startsWith("bad extraction:")
  ) {
    return {
      code: "PROVIDER_SCHEMA_INVALID",
      retryable: false,
      safeMessage: safeMessageFor("PROVIDER_SCHEMA_INVALID"),
    };
  }
  if (message.includes("moderation rejected")) {
    return {
      code: "MODERATION_REJECTED",
      retryable: false,
      safeMessage: safeMessageFor("MODERATION_REJECTED"),
    };
  }
  if (message.includes("prose lint rejected")) {
    return {
      code: "PROSE_LINT_FAILED",
      retryable: false,
      safeMessage: safeMessageFor("PROSE_LINT_FAILED"),
    };
  }
  if (
    message.includes("unsupported image format") ||
    message.includes("decode")
  ) {
    return {
      code: "IMAGE_COMPRESSION_FAILED",
      retryable: false,
      safeMessage: safeMessageFor("IMAGE_COMPRESSION_FAILED"),
    };
  }
  if (
    message.includes("missing storage file") ||
    message.includes("no stored file")
  ) {
    return {
      code: "STORAGE_FAILED",
      retryable: false,
      safeMessage: safeMessageFor("STORAGE_FAILED"),
    };
  }

  return {
    code: "INTERNAL_FAILURE",
    retryable: false,
    safeMessage: safeMessageFor("INTERNAL_FAILURE"),
  };
}

export function safeMessageFor(code: string): string {
  switch (code) {
    case "CONFIG_MISSING":
      return "Configuration is incomplete.";
    case "CONFIG_INVALID":
      return "Configuration is invalid.";
    case "PROVIDER_TIMEOUT":
      return "The provider timed out.";
    case "PROVIDER_NETWORK":
      return "The provider could not be reached.";
    case "PROVIDER_RATE_LIMITED":
      return "The provider is busy.";
    case "PROVIDER_AUTH_FAILED":
      return "The provider rejected the credentials.";
    case "PROVIDER_FUNDING_REQUIRED":
      return "The provider account needs funding.";
    case "PROVIDER_MODEL_UNAVAILABLE":
      return "The requested model is unavailable.";
    case "PROVIDER_INVALID_JSON":
      return "The provider returned invalid JSON.";
    case "PROVIDER_SCHEMA_INVALID":
      return "The provider returned an unexpected shape.";
    case "PROVIDER_EMPTY_RESPONSE":
      return "The provider returned no content.";
    case "PROVIDER_HTTP_ERROR":
      return "The provider request failed.";
    case "MODERATION_REJECTED":
      return "The content check rejected the result.";
    case "PROSE_LINT_FAILED":
      return "The chapter did not pass the writing check.";
    case "IMAGE_COMPRESSION_FAILED":
      return "The illustration could not be prepared.";
    case "STORAGE_FAILED":
      return "Stored content could not be read.";
    case "EXPORT_BUILD_FAILED":
      return "The book could not be built.";
    case "FILE_DELIVERY_FAILED":
      return "The book file could not be delivered.";
    default:
      return "The operation failed.";
  }
}

export function statusCodeForHttp(status: number): string {
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  if (status === 402) return "PROVIDER_FUNDING_REQUIRED";
  if (status === 404) return "PROVIDER_MODEL_UNAVAILABLE";
  if (status === 429) return "PROVIDER_RATE_LIMITED";
  if (status === 408) return "PROVIDER_TIMEOUT";
  return "PROVIDER_HTTP_ERROR";
}
