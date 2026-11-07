import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiImageGenerator } from "./image";
import { getImageGenerator } from "./imageProvider";
import { createSurplusImageGenerator } from "./surplusImage";

vi.mock("./image", () => ({ createGeminiImageGenerator: vi.fn() }));
vi.mock("./surplusImage", () => ({ createSurplusImageGenerator: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe("image provider selection", () => {
  it("defaults to Gemini even when a Surplus key is configured", () => {
    getImageGenerator({
      GEMINI_API_KEY: "gemini-key",
      SURPLUS_API_KEY: "surplus-key",
    });
    expect(createGeminiImageGenerator).toHaveBeenCalled();
    expect(createSurplusImageGenerator).not.toHaveBeenCalled();
  });

  it("selects the configured Surplus model and discount floor", () => {
    getImageGenerator({
      IMAGE_PROVIDER: "surplus",
      SURPLUS_API_KEY: "surplus-key",
      SURPLUS_IMAGE_MODEL: "venice-z-image-turbo",
      SURPLUS_MIN_DISCOUNT_PCT: "40",
    });
    expect(createSurplusImageGenerator).toHaveBeenCalledWith({
      apiKey: "surplus-key",
      model: "venice-z-image-turbo",
      minDiscountPct: 40,
    });
  });

  it("uses the verified budget model and requires an explicit discount", () => {
    getImageGenerator({
      IMAGE_PROVIDER: "surplus",
      SURPLUS_API_KEY: "surplus-key",
    });
    expect(createSurplusImageGenerator).toHaveBeenCalledWith({
      apiKey: "surplus-key",
      model: "gemini-2.5-flash-image",
      minDiscountPct: 50,
    });
    expect(() =>
      getImageGenerator({
        IMAGE_PROVIDER: "surplus",
        SURPLUS_API_KEY: "surplus-key",
        SURPLUS_MIN_DISCOUNT_PCT: "",
      }),
    ).toThrow(/cannot be empty/);
  });

  it("does not fall back to a second paid vendor when Surplus fails", async () => {
    const generate = vi
      .fn()
      .mockRejectedValue(new Error("no eligible sellers"));
    vi.mocked(createSurplusImageGenerator).mockReturnValue(generate);
    const image = getImageGenerator({
      IMAGE_PROVIDER: "surplus",
      SURPLUS_API_KEY: "surplus-key",
      GEMINI_API_KEY: "gemini-key",
    });
    if (!image) throw new Error("missing generator");
    await expect(image({ prompt: "A kite" })).rejects.toThrow(
      "no eligible sellers",
    );
    expect(createGeminiImageGenerator).not.toHaveBeenCalled();
  });

  it("can disable new image spending without needing any provider key", () => {
    expect(getImageGenerator({ IMAGE_PROVIDER: "disabled" })).toBeNull();
    expect(createGeminiImageGenerator).not.toHaveBeenCalled();
    expect(createSurplusImageGenerator).not.toHaveBeenCalled();
  });

  it("rejects missing credentials and unknown provider names", () => {
    expect(() =>
      getImageGenerator({
        IMAGE_PROVIDER: "surplus",
        GEMINI_API_KEY: "gemini-key",
      }),
    ).toThrow(/SURPLUS_API_KEY/);
    expect(() => getImageGenerator({ IMAGE_PROVIDER: "typo" })).toThrow(
      /IMAGE_PROVIDER/,
    );
  });
});
