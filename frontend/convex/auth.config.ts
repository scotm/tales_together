import type { AuthConfig } from "convex/server";

// Clerk's Frontend API URL for this deployment's Clerk instance, e.g.
// https://witty-mackerel-8464.clerk.accounts.dev (development) or
// https://clerk.talestogether.xyz (production).
export default {
  providers: [
    {
      // biome-ignore lint/style/noNonNullAssertion: deploy fails without it.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
