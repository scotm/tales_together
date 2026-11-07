import {
  safeMessageFor,
  statusCodeForHttp,
} from "../../shared/diagnostics/contract";
import {
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_RETRY_BASE_MS,
  PROVIDER_RETRY_MAX_MS,
  PROVIDER_TIMEOUT_MS,
} from "../lib/config";

export interface ProviderRetry {
  attempt: number;
  maxAttempts: number;
  nextRetryAt: number;
}

export interface RequestAttemptInfo {
  attempt: number;
  maxAttempts: number;
  phase: "started" | "succeeded" | "failed";
  status?: number;
  code?: string;
  message?: string;
  retryable?: boolean;
  willRetry?: boolean;
  delayMs?: number;
  durationMs?: number;
  headerMs?: number;
  bodyMs?: number;
  requestId?: string;
  costMicroUsd?: number;
  currency?: string;
  costBasis?: "reported" | "estimated" | "settled" | "unknown";
}

export interface RequestResultInfo {
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costMicroUsd?: number;
    currency?: string;
    costBasis?: "reported" | "estimated" | "settled" | "unknown";
  };
  finishReason?: string;
  requestId?: string;
  costMicroUsd?: number;
  currency?: string;
  costBasis?: "reported" | "estimated" | "settled" | "unknown";
}

export interface RequestProgress {
  onRetry?: (retry: ProviderRetry) => void | Promise<void>;
  /** Every transport attempt, including failures. Hooks must never throw. */
  onAttempt?: (attempt: RequestAttemptInfo) => void | Promise<void>;
  /** Parsed usage/finish reason, when the provider reports one. */
  onResult?: (result: RequestResultInfo) => void | Promise<void>;
}

/** No response bodies, URLs, credentials or prompts enter errors or UI state. */
export class ProviderRequestError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
    options: { code?: string; status?: number } = {},
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.code = options.code ?? "PROVIDER_HTTP_ERROR";
    this.status = options.status;
  }
}

function retryAfter(value: string | null): number {
  if (!value?.trim()) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

interface ReceiptHeaders {
  requestId?: string;
  costMicroUsd?: number;
  currency?: string;
  costBasis?: "reported" | "estimated" | "settled" | "unknown";
}

/** Only allowlisted receipt headers leave the transport boundary. */
function receiptHeaders(response: Response): ReceiptHeaders {
  const rawId =
    response.headers.get("x-request-id") ??
    response.headers.get("x-goog-request-id") ??
    undefined;
  const requestId =
    rawId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(rawId)
      ? rawId
      : undefined;
  const rawCost = response.headers.get("x-si-buyer-cost-micro");
  const costMicroUsd =
    rawCost && /^\d+$/.test(rawCost) && Number.isSafeInteger(Number(rawCost))
      ? Number(rawCost)
      : undefined;
  return {
    requestId,
    costMicroUsd,
    currency: costMicroUsd === undefined ? undefined : "USD",
    costBasis: costMicroUsd === undefined ? undefined : "reported",
  };
}

function now(): number {
  // performance.now is monotonic where available; Date.now is the fallback.
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

async function callHook<T>(
  hook: ((value: T) => void | Promise<void>) | undefined,
  value: T,
): Promise<void> {
  if (!hook) return;
  try {
    await hook(value);
  } catch {
    // A diagnostics sink failing is not a provider failure and must not retry.
  }
}

function normalizeFailure(
  provider: string,
  failure: unknown,
): ProviderRequestError {
  if (failure instanceof ProviderRequestError) return failure;
  if (failure instanceof TypeError) {
    return new ProviderRequestError(
      `${provider} could not be reached`,
      true,
      0,
      { code: "PROVIDER_NETWORK" },
    );
  }
  if (failure instanceof Error && failure.name === "AbortError") {
    return new ProviderRequestError(`${provider} timed out`, true, 0, {
      code: "PROVIDER_TIMEOUT",
    });
  }
  if (failure instanceof SyntaxError) {
    return new ProviderRequestError(`${provider} request failed`, false, 0, {
      code: "PROVIDER_INVALID_JSON",
    });
  }
  return new ProviderRequestError(`${provider} request failed`, false, 0, {
    code: "PROVIDER_HTTP_ERROR",
  });
}

/** Retry only the HTTP request, never parsing/validation or database writes. */
export async function requestProviderJson<T>(options: {
  provider: string;
  url: string;
  init: RequestInit;
  fetchImpl?: typeof fetch;
  progress?: RequestProgress;
  onResponse?: (response: Response) => void;
}): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch;
  for (let attempt = 1; ; attempt += 1) {
    const started = now();
    await callHook(options.progress?.onAttempt, {
      attempt,
      maxAttempts: PROVIDER_MAX_ATTEMPTS,
      phase: "started",
    });

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure: unknown;
    let status: number | undefined;
    let headerMs: number | undefined;
    let bodyMs: number | undefined;
    let receipt: ReceiptHeaders = {};
    let payload: T | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ProviderRequestError(`${options.provider} timed out`, true, 0, {
              code: "PROVIDER_TIMEOUT",
            }),
          );
          controller.abort();
        }, PROVIDER_TIMEOUT_MS);
      });
      const request = async () => {
        const response = await doFetch(options.url, {
          ...options.init,
          signal: controller.signal,
        });
        status = response.status;
        headerMs = now() - started;
        receipt = receiptHeaders(response);
        // Headers are needed even for non-2xx and malformed bodies.
        try {
          options.onResponse?.(response);
        } catch {
          // Receipt collection must not turn a successful call into a failure.
        }
        if (!response.ok) {
          const transient = [408, 429, 500, 502, 503, 504].includes(
            response.status,
          );
          const delay = retryAfter(response.headers.get("retry-after"));
          await response.body?.cancel().catch(() => {});
          // Do not retry sooner than a provider asks, or hold actions open for
          // arbitrarily long quota windows. The user can retry later instead.
          throw new ProviderRequestError(
            `${options.provider} ${response.status}: request failed`,
            transient && delay <= PROVIDER_RETRY_MAX_MS,
            delay,
            {
              code: statusCodeForHttp(response.status),
              status: response.status,
            },
          );
        }
        const readStarted = now();
        const parsed = (await response.json()) as T;
        bodyMs = now() - readStarted;
        return parsed;
      };
      payload = await Promise.race([request(), timeout]);
      await callHook(options.progress?.onAttempt, {
        attempt,
        maxAttempts: PROVIDER_MAX_ATTEMPTS,
        phase: "succeeded",
        status,
        durationMs: now() - started,
        headerMs,
        bodyMs,
        ...receipt,
      });
      return payload;
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timer);
    }

    const error = normalizeFailure(options.provider, failure);
    const delayMs = error.retryable
      ? Math.max(
          error.retryAfterMs,
          Math.round(
            Math.min(
              PROVIDER_RETRY_MAX_MS,
              PROVIDER_RETRY_BASE_MS * 2 ** (attempt - 1),
            ) *
              (0.5 + Math.random() * 0.5),
          ),
        )
      : 0;
    const willRetry = error.retryable && attempt < PROVIDER_MAX_ATTEMPTS;
    await callHook(options.progress?.onAttempt, {
      attempt,
      maxAttempts: PROVIDER_MAX_ATTEMPTS,
      phase: "failed",
      status: error.status ?? status,
      code: error.code,
      message: safeMessageFor(error.code),
      retryable: error.retryable,
      willRetry,
      delayMs: willRetry ? delayMs : undefined,
      durationMs: now() - started,
      headerMs,
      bodyMs,
      ...receipt,
    });
    if (!willRetry) throw error;

    await options.progress?.onRetry?.({
      attempt: attempt + 1,
      maxAttempts: PROVIDER_MAX_ATTEMPTS,
      nextRetryAt: Date.now() + delayMs,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
}
