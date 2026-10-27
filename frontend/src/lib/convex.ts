import { ConvexReactClient } from "convex/react";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!url) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` in frontend/ or add it to .env.local.",
  );
}

export const convex = new ConvexReactClient(url);
