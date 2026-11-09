const configuredKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!configuredKey) {
  throw new Error(
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Add the Clerk publishable key to .env.local.",
  );
}

export const publishableKey: string = configuredKey;
