import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";
import { createSurplusImageGenerator } from "./surplusImage";

function fixture() {
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  return PNG.sync.write(png);
}

function generator(fetchImpl: unknown, minDiscountPct = 30) {
  return createSurplusImageGenerator({
    apiKey: "test-secret-key",
    model: "seedream-4.5",
    minDiscountPct,
    fetchImpl: fetchImpl as typeof fetch,
  });
}

describe("Surplus image adapter", () => {
  it.each([
    ["4:3", "1024x768"],
    ["2:3", "1024x1536"],
  ])(
    "requests a single inline %s image through the discount floor",
    async (aspectRatio, size) => {
      const bytes = fixture();
      const fetchImpl = vi.fn().mockResolvedValue(
        Response.json(
          { data: [{ b64_json: bytes.toString("base64") }] },
          {
            headers: {
              "x-request-id": "receipt-1",
              "x-si-buyer-cost-micro": "28000",
              "x-si-served-by": "marketplace",
            },
          },
        ),
      );
      const image = await generator(fetchImpl)({
        prompt: "A kite",
        aspectRatio,
      });
      const [url, init] = fetchImpl.mock.calls[0] ?? [];
      expect(url).toBe(
        "https://api.surplusintelligence.ai/min30/v1/images/generations",
      );
      expect(new Headers(init.headers).get("authorization")).toBe(
        "Bearer test-secret-key",
      );
      expect(JSON.parse(init.body)).toEqual({
        model: "seedream-4.5",
        prompt: "A kite",
        n: 1,
        size,
        response_format: "b64_json",
      });
      expect(image.bytes).toEqual(new Uint8Array(bytes));
      expect(image.contentType).toBe("image/png");
      expect(image.requestId).toBe("receipt-1");
      expect(image.costMicroUsd).toBe(28000);
      expect(image.servedBy).toBe("marketplace");
    },
  );

  it("detects JPEG bytes and leaves missing price telemetry unknown", async () => {
    const bytes = Buffer.from([255, 216, 255, 217]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [{ b64_json: bytes.toString("base64") }] }),
      );
    const image = await generator(fetchImpl)({ prompt: "A kite" });
    expect(image.contentType).toBe("image/jpeg");
    expect(image.costMicroUsd).toBeUndefined();
  });

  it("explicitly disables the Venice watermark on the budget model", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [{ b64_json: fixture().toString("base64") }] }),
      );
    await createSurplusImageGenerator({
      apiKey: "test-key",
      model: "venice-z-image-turbo",
      minDiscountPct: 15,
      fetchImpl: fetchImpl as typeof fetch,
    })({ prompt: "A kite" });
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body)).toMatchObject({
      hide_watermark: true,
      n: 1,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("/min15/v1/");
  });

  it.each([402, 404])(
    "does not retry a funding/discount rejection (%s)",
    async (status) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(new Response("test-secret-key", { status }));
      const result = generator(fetchImpl)({ prompt: "A kite" });
      await expect(result).rejects.toThrow(`surplus-image ${status}`);
      await expect(result).rejects.not.toThrow("test-secret-key");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("refuses a URL-only response instead of downloading from an arbitrary host", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: [{ url: "https://example.test/image.png" }] }),
      );
    await expect(generator(fetchImpl)({ prompt: "A kite" })).rejects.toThrow(
      "no inline image",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses malformed/non-image output without a paid regeneration", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(Response.json({ data: [{ b64_json: "aGVsbG8=" }] }));
    await expect(generator(fetchImpl)({ prompt: "A kite" })).rejects.toThrow(
      "unsupported image format",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 101, 30.5, Number.NaN])(
    "rejects an invalid floor %s before any request",
    (floor) => {
      expect(() => generator(vi.fn(), floor)).toThrow(/integer from 0 to 100/);
    },
  );
});
