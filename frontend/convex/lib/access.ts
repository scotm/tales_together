import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export const SIGN_IN_REQUIRED = "Please sign in to use Tales Together.";

/**
 * The Clerk instance is invite-only, so any verified identity is a guest.
 * This gates access and spend; it does not make anyone a story's owner.
 */
export async function requireMember(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError(SIGN_IN_REQUIRED);
  return identity;
}
