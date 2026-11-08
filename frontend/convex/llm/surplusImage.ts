import { decodeBase64, type ImageGenerator } from "./image";
import { requestProviderJson } from "./request";

interface SurplusImageResponse {
  data?: { b64_json?: string }[];
}

const SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "4:3": "1024x768",
  "3:4": "768x1024",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
};

export function createSurplusImageGenerator(options: {
  apiKey: string;
  model: string;
  minDiscountPct: number;
  fetchImpl?: typeof fetch;
}): ImageGenerator {
  if (
    !Number.isInteger(options.minDiscountPct) ||
    options.minDiscountPct < 0 ||
    options.minDiscountPct > 100
  ) {
    throw new Error(
      "SURPLUS_MIN_DISCOUNT_PCT must be an integer from 0 to 100",
    );
  }
  return async ({ prompt, aspectRatio = "4:3", progress }) => {
    const size = SIZES[aspectRatio];
    if (!size) throw new Error("unsupported Surplus image aspect ratio");
    let requestId: string | undefined;
    let costMicroUsd: number | undefined;
    let servedBy: string | undefined;
    const payload = await requestProviderJson<SurplusImageResponse>({
      provider: "surplus-image",
      url: `https://api.surplusintelligence.ai/min${options.minDiscountPct}/v1/images/generations`,
      fetchImpl: options.fetchImpl,
      progress,
      onResponse: (response) => {
        requestId = response.headers.get("x-request-id") ?? undefined;
        const cost = response.headers.get("x-si-buyer-cost-micro");
        if (
          cost !== null &&
          /^\d+$/.test(cost) &&
          Number.isSafeInteger(Number(cost))
        ) {
          costMicroUsd = Number(cost);
        }
        servedBy = response.headers.get("x-si-served-by") ?? undefined;
      },
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          prompt,
          n: 1,
          size,
          response_format: "b64_json",
          // Verified on Surplus's Venice route: otherwise Venice brands the
          // generated image even when the prompt says "no text".
          ...(options.model === "venice-z-image-turbo"
            ? { hide_watermark: true }
            : {}),
        }),
      },
    });
    const encoded = payload.data?.[0]?.b64_json;
    if (typeof encoded !== "string" || !encoded)
      throw new Error("surplus returned no inline image");
    const bytes = decodeBase64(
      encoded.replace(/^data:image\/(png|jpeg);base64,/, ""),
    );
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    const contentType = pngSignature.every(
      (byte, index) => bytes[index] === byte,
    )
      ? "image/png"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : null;
    if (!contentType)
      throw new Error("surplus returned an unsupported image format");
    try {
      await progress?.onResult?.({
        requestId,
        costMicroUsd,
        currency: costMicroUsd === undefined ? undefined : "USD",
        costBasis: costMicroUsd === undefined ? undefined : "reported",
      });
    } catch {
      // Receipt collection must not change provider behaviour.
    }
    return { bytes, contentType, requestId, costMicroUsd, servedBy };
  };
}
