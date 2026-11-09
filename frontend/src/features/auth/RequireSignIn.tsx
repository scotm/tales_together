import { useConvexAuth } from "convex/react";
import type { ReactNode } from "react";
import { SignInScreen } from "./SignInScreen";

/**
 * Wraps a screen rather than the navigator, so a shared story link keeps its
 * URL through sign-in and Help → Diagnostics stays reachable while signed out.
 */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isAuthenticated) return children;
  return <SignInScreen checking={isLoading} />;
}
