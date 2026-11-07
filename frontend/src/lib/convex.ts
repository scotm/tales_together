import { ConvexReactClient } from "convex/react";
import { resolveConvexUrl } from "./convexUrl";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!url) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` in frontend/ or add it to .env.local.",
  );
}

const clientUrl = resolveConvexUrl(url);

export function createConvexClient() {
  return new ConvexReactClient(clientUrl);
}

export const convex = createConvexClient();
