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

export interface RequestProgress {
  onRetry?: (retry: ProviderRetry) => void | Promise<void>;
}

/** No response bodies, URLs, credentials or prompts enter errors or UI state. */
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super(message);
    this.name = "ProviderRequestError";
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
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failure: unknown;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ProviderRequestError(`${options.provider} timed out`, true),
          );
          controller.abort();
        }, PROVIDER_TIMEOUT_MS);
      });
      const request = async () => {
        const response = await doFetch(options.url, {
          ...options.init,
          signal: controller.signal,
        });
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
          );
        }
        const payload = (await response.json()) as T;
        options.onResponse?.(response);
        return payload;
      };
      return await Promise.race([request(), timeout]);
    } catch (error) {
      failure = error;
    } finally {
      clearTimeout(timer);
    }

    const error =
      failure instanceof ProviderRequestError
        ? failure
        : new ProviderRequestError(
            `${options.provider} request failed`,
            // Fetch rejects network failures with TypeError. Malformed JSON
            // (SyntaxError), blocked/empty output and schema errors don't retry.
            failure instanceof TypeError ||
              (failure instanceof Error && failure.name === "AbortError"),
          );
    if (!error.retryable || attempt === PROVIDER_MAX_ATTEMPTS) throw error;

    // Equal jitter avoids a retry storm while retaining increasing delays.
    const ceiling = Math.min(
      PROVIDER_RETRY_MAX_MS,
      PROVIDER_RETRY_BASE_MS * 2 ** (attempt - 1),
    );
    const delay = Math.max(
      error.retryAfterMs,
      Math.round(ceiling * (0.5 + Math.random() * 0.5)),
    );
    await options.progress?.onRetry?.({
      attempt: attempt + 1,
      maxAttempts: PROVIDER_MAX_ATTEMPTS,
      nextRetryAt: Date.now() + delay,
    });
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}
