import { v } from "convex/values";
import {
  classifyError,
  createEventId,
  type DiagnosticEvent,
  type DiagnosticEventInput,
  type DiagnosticSource,
  statusCodeForHttp,
} from "../../shared/diagnostics/contract";
import {
  createConsoleSink,
  createDiagnosticLogger,
} from "../../shared/diagnostics/logger";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type {
  ProviderRetry,
  RequestAttemptInfo,
  RequestProgress,
} from "../llm/request";

export const diagnosticContext = v.object({
  traceId: v.string(),
  operationId: v.string(),
  parentOperationId: v.optional(v.string()),
  runId: v.optional(v.string()),
  scheduledAt: v.optional(v.number()),
  storyId: v.optional(v.id("stories")),
  chapterId: v.optional(v.id("chapters")),
});

export type DiagnosticContext = {
  traceId: string;
  operationId: string;
  parentOperationId?: string;
  runId?: string;
  scheduledAt?: number;
  storyId?: Id<"stories">;
  chapterId?: Id<"chapters">;
};

type DiagnosticMutationCtx = Pick<ActionCtx, "runMutation">;

export interface DiagnosticOptions {
  name: string;
  traceId: string;
  source?: DiagnosticSource;
  operationId?: string;
  parentOperationId?: string;
  runId?: string;
  scheduledAt?: number;
  storyId?: Id<"stories">;
  chapterId?: Id<"chapters">;
  provider?: string;
  model?: string;
  purpose?: string;
}

export interface ReceiptInput {
  dedupeKey: string;
  provider: string;
  model?: string;
  purpose?: string;
  requestId?: string;
  operationId?: string;
  traceId?: string;
  storyId?: Id<"stories">;
  chapterId?: Id<"chapters">;
  attempt: number;
  outcome: "succeeded" | "failed" | "timeout" | "unknown";
  httpStatus?: number;
  durationMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costMicroUsd?: number;
    currency?: string;
    costBasis?: "reported" | "estimated" | "settled" | "unknown";
  };
  costMicroUsd?: number;
  currency?: string;
  costBasis?: "reported" | "estimated" | "settled" | "unknown";
  observedAt?: number;
}

export interface Diagnostics {
  scope: DiagnosticContext;
  startedAt: number;
  record(
    name: string,
    fields?: Partial<Omit<DiagnosticEventInput, "name" | "source">>,
  ): Promise<DiagnosticEvent | null>;
  start(): Promise<void>;
  finish(
    status: "succeeded" | "failed" | "degraded" | "superseded" | "recovered",
    error?: unknown,
    extra?: { attempts?: number; retries?: number },
  ): Promise<void>;
  recordReceipt(receipt: ReceiptInput): Promise<void>;
  providerProgress(options: {
    provider: string;
    model?: string;
    purpose: string;
    business?: RequestProgress;
  }): RequestProgress;
  child(options: { name: string; runId?: string }): DiagnosticContext;
}

const log = createDiagnosticLogger([createConsoleSink()]);
const PERSIST_TIMEOUT_MS = 1_000;

function bounded<T>(promise: Promise<T>): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), PERSIST_TIMEOUT_MS),
    ),
  ]).catch(() => undefined);
}

/**
 * One logical action execution. Every persistence call is isolated: a broken
 * diagnostics table must never turn a readable chapter into a failed one.
 */
export function createDiagnostics(
  ctx: DiagnosticMutationCtx,
  options: DiagnosticOptions,
): Diagnostics {
  const operationId = options.operationId ?? createEventId("op");
  const scope: DiagnosticContext = {
    traceId: options.traceId,
    operationId,
    parentOperationId: options.parentOperationId,
    runId: options.runId,
    scheduledAt: options.scheduledAt,
    storyId: options.storyId,
    chapterId: options.chapterId,
  };
  const startedAt = Date.now();
  let finished = false;
  let attempts = 0;
  let retries = 0;

  async function persist(
    event: DiagnosticEvent,
    critical: boolean,
  ): Promise<void> {
    if (!critical) return;
    let result: unknown;
    try {
      result = await bounded(
        ctx.runMutation(internal.diagnostics.recordEvent, {
          eventId: event.eventId,
          operationId: event.operationId,
          traceId: event.traceId,
          parentOperationId: event.parentOperationId,
          runId: event.runId,
          name: event.name,
          level: event.level,
          source: event.source,
          sequence: event.sequence ?? 0,
          stage: event.stage,
          status: event.status,
          errorCode: event.errorCode,
          safeMessage: event.message,
          retryable: event.retryable,
          durationMs: event.durationMs,
          bytesBefore: event.bytesBefore,
          bytesAfter: event.bytesAfter,
          provider: event.provider,
          model: event.model,
          purpose: event.purpose,
          httpStatus: event.httpStatus,
          requestId: event.requestId,
          attempt: event.attempt,
          usage: event.usage,
          storyId: options.storyId as Id<"stories"> | undefined,
          chapterId: options.chapterId as Id<"chapters"> | undefined,
          timestamp: event.timestamp,
        }),
      );
    } catch {
      result = undefined;
    }
    if (result === undefined) {
      log.record({
        name: "diagnostics.dropped",
        level: "warn",
        source: options.source ?? "convex",
        operationId,
        traceId: options.traceId,
        message: "A diagnostic event could not be stored.",
      });
    }
  }

  const diagnostics: Diagnostics = {
    scope,
    startedAt,
    async record(name, fields = {}) {
      const event = log.record({
        name,
        level: "info",
        source: options.source ?? "convex",
        traceId: options.traceId,
        operationId,
        parentOperationId: options.parentOperationId,
        runId: options.runId,
        storyId: options.storyId,
        chapterId: options.chapterId,
        provider: options.provider,
        model: options.model,
        purpose: options.purpose,
        ...fields,
      });
      if (!event) return null;
      const critical =
        event.level === "error" ||
        event.level === "warn" ||
        ["failed", "degraded", "recovered", "superseded"].includes(
          event.status ?? "",
        );
      await persist(event, critical);
      return event;
    },

    async start() {
      await bounded(
        ctx.runMutation(internal.diagnostics.startOperation, {
          operationId,
          traceId: options.traceId,
          parentOperationId: options.parentOperationId,
          runId: options.runId,
          name: options.name,
          source: options.source ?? "convex",
          storyId: options.storyId as Id<"stories"> | undefined,
          chapterId: options.chapterId as Id<"chapters"> | undefined,
          startedAt,
          queueDelayMs: options.scheduledAt
            ? Math.max(0, startedAt - options.scheduledAt)
            : undefined,
          provider: options.provider,
          model: options.model,
          purpose: options.purpose,
        }),
      );
      await diagnostics.record("operation.started", {
        status: "started",
        stage: options.name,
      });
      if (options.scheduledAt) {
        await diagnostics.record("operation.queued", {
          status: "succeeded",
          stage: "queue",
          durationMs: Math.max(0, startedAt - options.scheduledAt),
        });
      }
    },

    async finish(status, error, extra = {}) {
      if (finished) return;
      finished = true;
      const endedAt = Date.now();
      const classified = error ? classifyError(error) : undefined;
      attempts = Math.max(attempts, extra.attempts ?? 0);
      retries = Math.max(retries, extra.retries ?? 0);
      await diagnostics.record(`operation.${status}`, {
        level:
          status === "succeeded"
            ? "info"
            : status === "degraded"
              ? "warn"
              : "error",
        status,
        errorCode: classified?.code,
        message: classified?.safeMessage,
        retryable: classified?.retryable,
        httpStatus: classified?.httpStatus,
        durationMs: endedAt - startedAt,
      });
      await bounded(
        ctx.runMutation(internal.diagnostics.finishOperation, {
          operationId,
          status,
          endedAt,
          durationMs: endedAt - startedAt,
          errorCode: classified?.code,
          safeMessage: classified?.safeMessage,
          attempts: attempts || undefined,
          retries: retries || undefined,
          provider: options.provider,
          model: options.model,
          purpose: options.purpose,
        }),
      );
    },

    async recordReceipt(receipt) {
      await bounded(
        ctx.runMutation(internal.diagnostics.recordReceipt, {
          ...receipt,
          operationId: receipt.operationId ?? operationId,
          traceId: receipt.traceId ?? options.traceId,
          storyId: receipt.storyId ?? options.storyId,
          chapterId: receipt.chapterId ?? options.chapterId,
          observedAt: receipt.observedAt ?? Date.now(),
        }),
      );
    },

    providerProgress({ provider, model, purpose, business }) {
      let lastAttempt = 0;
      let lastRequestId: string | undefined;
      let lastCostMicroUsd: number | undefined;
      let lastCurrency: string | undefined;
      let lastCostBasis:
        | "reported"
        | "estimated"
        | "settled"
        | "unknown"
        | undefined;
      return {
        onAttempt: async (attempt: RequestAttemptInfo) => {
          attempts = Math.max(attempts, attempt.attempt);
          const status =
            attempt.phase === "started"
              ? "started"
              : attempt.phase === "succeeded"
                ? "succeeded"
                : "failed";
          if (attempt.phase !== "started") {
            lastAttempt = attempt.attempt;
            lastRequestId = attempt.requestId;
            lastCostMicroUsd = attempt.costMicroUsd;
            lastCurrency = attempt.currency;
            lastCostBasis = attempt.costBasis;
            const outcome =
              attempt.phase === "succeeded"
                ? "succeeded"
                : attempt.code === "PROVIDER_TIMEOUT"
                  ? "timeout"
                  : "failed";
            await diagnostics.recordReceipt({
              dedupeKey: attempt.requestId
                ? `${provider}:${attempt.requestId}`
                : `${provider}:${operationId}:${attempt.attempt}`,
              provider,
              model,
              purpose,
              requestId: attempt.requestId,
              attempt: attempt.attempt,
              outcome,
              httpStatus: attempt.status,
              durationMs: attempt.durationMs,
              costMicroUsd: attempt.costMicroUsd,
              currency: attempt.currency,
              costBasis: attempt.costBasis ?? "unknown",
              observedAt: Date.now(),
            });
          }
          await diagnostics.record(`provider.attempt.${attempt.phase}`, {
            level: attempt.phase === "failed" ? "error" : "info",
            status,
            stage: purpose,
            provider,
            model,
            purpose,
            attempt: attempt.attempt,
            durationMs: attempt.durationMs,
            httpStatus: attempt.status,
            errorCode:
              attempt.phase === "failed"
                ? (attempt.code ??
                  (attempt.status
                    ? statusCodeForHttp(attempt.status)
                    : "PROVIDER_NETWORK"))
                : undefined,
            message:
              attempt.phase === "failed" && attempt.willRetry
                ? `${attempt.message} retry_in_ms=${attempt.delayMs ?? 0}`
                : attempt.message,
            retryable: attempt.retryable,
          });
        },
        onRetry: async (retry: ProviderRetry) => {
          retries += 1;
          await diagnostics.record("provider.attempt.retry", {
            level: "warn",
            status: "started",
            stage: purpose,
            provider,
            model,
            purpose,
            attempt: retry.attempt,
            retryable: true,
            message: "Retrying the provider request.",
          });
          await business?.onRetry?.(retry);
        },
        onResult: async (result) => {
          const requestId = result.requestId ?? lastRequestId;
          const costMicroUsd = result.costMicroUsd ?? lastCostMicroUsd;
          const currency = result.currency ?? lastCurrency;
          const costBasis = result.costBasis ?? lastCostBasis;
          await diagnostics.recordReceipt({
            dedupeKey: requestId
              ? `${provider}:${requestId}`
              : `${provider}:${operationId}:${lastAttempt || 1}`,
            provider,
            model,
            purpose,
            requestId,
            attempt: lastAttempt || 1,
            outcome: "succeeded",
            usage: result.usage,
            costMicroUsd,
            currency,
            costBasis: costBasis ?? "unknown",
            observedAt: Date.now(),
          });
          await diagnostics.record("provider.attempt.result", {
            status: "succeeded",
            stage: purpose,
            provider,
            model,
            purpose,
            usage: result.usage,
            message: result.finishReason
              ? `finish:${result.finishReason}`
              : undefined,
          });
        },
      };
    },

    child({ name, runId }) {
      return {
        traceId: options.traceId,
        operationId: createEventId(name.replace(/[^a-z0-9]+/gi, "-")),
        parentOperationId: operationId,
        runId,
        scheduledAt: Date.now(),
        storyId: options.storyId,
        chapterId: options.chapterId,
      };
    },
  };

  return diagnostics;
}

export function operationIdFor(kind: string, runId: string): string {
  return `${kind}-${runId}`;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Client ids are labels only; they never authorize a state change. */
export function safeOperationId(value: string | undefined): string | undefined {
  return value && ID_PATTERN.test(value) ? value : undefined;
}

export function traceIdFor(story: { _id: string; traceId?: string }): string {
  return story.traceId ?? story._id;
}
