import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_TIMEOUT_MS } from "../lib/config";
import { requestProviderJson } from "./request";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(1);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function request(fetchImpl: unknown, onRetry = vi.fn()) {
  return requestProviderJson({
    provider: "test",
    url: "https://example.test/generate",
    init: { method: "POST", body: "same request" },
    fetchImpl: fetchImpl as typeof fetch,
    progress: { onRetry },
  });
}

describe("provider backoff", () => {
  it("backs off exponentially before recovering, replaying the same request", async () => {
    const times: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      times.push(Date.now());
      return times.length < 4
        ? new Response("unavailable", { status: 503 })
        : Response.json({ ok: true });
    });
    const onRetry = vi.fn();
    const result = request(fetchImpl, onRetry);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ ok: true });
    expect(times.slice(1).map((time, i) => time - (times[i] ?? 0))).toEqual([
      1000, 2000, 4000,
    ]);
    expect(onRetry.mock.calls.map(([retry]) => retry.attempt)).toEqual([
      2, 3, 4,
    ]);
    expect(
      fetchImpl.mock.calls.every(([, init]) => init?.body === "same request"),
    ).toBe(true);
  });

  it.each([408, 429, 500, 502, 503, 504])(
    "stops after four attempts on HTTP %s",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(
          async () => new Response("secret-key and prompt text", { status }),
        );
      const result = expect(request(fetchImpl)).rejects.toThrow(
        `test ${status}`,
      );
      await vi.runAllTimersAsync();
      await result;
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    },
  );

  it.each([400, 401, 403, 404, 422, 501])(
    "does not retry HTTP %s",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("secret-key and prompt text", { status }),
        );
      const result = request(fetchImpl);
      await expect(result).rejects.toThrow(`test ${status}: request failed`);
      await expect(result).rejects.not.toThrow(/secret-key|prompt text/);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["5", "Wed, 01 Jan 2031 00:00:05 GMT"])(
    "honours Retry-After %s",
    async (header) => {
      vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response("busy", {
            status: 429,
            headers: { "retry-after": header },
          }),
        )
        .mockResolvedValueOnce(Response.json({ ok: true }));
      const result = request(fetchImpl);
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ ok: true });
    },
  );

  it("stops rather than retrying before a long quota window ends", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("busy", {
        status: 429,
        headers: { "retry-after": "3600" },
      }),
    );
    await expect(request(fetchImpl)).rejects.toThrow(/429/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("jitters exponential delays", async () => {
    vi.mocked(Math.random).mockReturnValue(0);
    const onRetry = vi.fn();
    const start = Date.now();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = request(fetchImpl, onRetry);
    await vi.runAllTimersAsync();
    await result;
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 2,
      maxAttempts: 4,
      nextRetryAt: start + 500,
    });
  });

  it("times out and aborts even a fetch implementation that never settles", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise(() => {}));
    const result = expect(request(fetchImpl)).rejects.toThrow(/timed out/);
    await vi.runAllTimersAsync();
    await result;
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(
      fetchImpl.mock.calls.every(([, init]) => init?.signal?.aborted),
    ).toBe(true);
  });

  it("keeps the timeout running while reading the response body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: () => new Promise(() => {}),
      } as Response)
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = request(fetchImpl);
    await vi.advanceTimersByTimeAsync(PROVIDER_TIMEOUT_MS + 1000);
    await expect(result).resolves.toEqual({ ok: true });
  });

  it("does not retry malformed JSON", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("bad json"));
    await expect(request(fetchImpl)).rejects.toThrow(/request failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
