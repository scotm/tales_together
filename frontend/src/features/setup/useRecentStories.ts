import { api } from "@convex/_generated/api";
import { useConvexConnectionState, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useQueryDiagnostics } from "@/lib/diagnostics/query";

/** How long an unresolved query/socket may spin before we offer recovery. */
export const CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Recent stories plus the connection health derived from them. Subscribed
 * for the whole setup screen so cached rows stay visible offline and the
 * stalled-connection notice appears even while the panel is closed.
 */
export function useRecentStories() {
  const result = useQuery(api.stories.listRecent);
  const [cached, setCached] = useState(result);
  useEffect(() => {
    if (result !== undefined) setCached(result);
  }, [result]);
  const stories = result ?? cached;
  const connection = useConvexConnectionState();
  useQueryDiagnostics(
    "stories.listRecent",
    result,
    connection.isWebSocketConnected,
  );
  const waiting = result === undefined || !connection.isWebSocketConnected;
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!waiting) return;
    const timer = setTimeout(() => setTimedOut(true), CONNECTION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  return {
    stories,
    connection,
    loading: stories === undefined && !timedOut,
    stalled: waiting && timedOut,
  };
}

export type RecentStories = ReturnType<typeof useRecentStories>;
