import {
  GEMINI_IMAGE_MODEL,
  SURPLUS_DEFAULT_IMAGE_MODEL,
  SURPLUS_DEFAULT_MIN_DISCOUNT_PCT,
} from "../lib/config";
import { createGeminiImageGenerator, type ImageGenerator } from "./image";
import { createSurplusImageGenerator } from "./surplusImage";

/** Image credentials are server-only. Missing configuration never changes vendor. */
export function getImageGenerator(
  environment: Record<string, string | undefined> = process.env,
): ImageGenerator | null {
  const provider = environment.IMAGE_PROVIDER ?? "gemini";
  if (provider === "disabled") return null;
  if (provider === "surplus") {
    const apiKey = environment.SURPLUS_API_KEY;
    if (!apiKey)
      throw new Error("SURPLUS_API_KEY is not set on this Convex deployment");
    const floor = environment.SURPLUS_MIN_DISCOUNT_PCT;
    if (floor !== undefined && !floor.trim()) {
      throw new Error("SURPLUS_MIN_DISCOUNT_PCT cannot be empty");
    }
    return createSurplusImageGenerator({
      apiKey,
      model: environment.SURPLUS_IMAGE_MODEL ?? SURPLUS_DEFAULT_IMAGE_MODEL,
      minDiscountPct:
        floor === undefined ? SURPLUS_DEFAULT_MIN_DISCOUNT_PCT : Number(floor),
    });
  }
  if (provider !== "gemini")
    throw new Error("IMAGE_PROVIDER must be gemini, surplus or disabled");
  const apiKey = environment.GEMINI_API_KEY;
  if (!apiKey)
    throw new Error("GEMINI_API_KEY is not set on this Convex deployment");
  return createGeminiImageGenerator({
    apiKey,
    model: environment.GEMINI_IMAGE_MODEL ?? GEMINI_IMAGE_MODEL,
  });
}
