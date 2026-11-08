import { useConvex, useConvexConnectionState } from "convex/react";
import { useEffect, useRef } from "react";
import { useDiagnostics } from "./DiagnosticsProvider";

function loopbackCorrected(
  configuredOrigin: string | undefined,
  effectiveOrigin: string,
): boolean {
  if (!configuredOrigin) return false;
  try {
    return (
      new URL(configuredOrigin).hostname !== new URL(effectiveOrigin).hostname
    );
  } catch {
    return false;
  }
}

/**
 * Records connection transitions, not every socket frame. A failed connection
 * is captured locally and never waits for a Convex mutation.
 */
export function ConnectionMonitor() {
  const connection = useConvexConnectionState();
  const client = useConvex();
  const diagnostics = useDiagnostics();
  const previous = useRef(connection);
  const firstConnectedAt = useRef<number | undefined>(undefined);
  const reconnectCount = useRef(0);

  useEffect(() => {
    const before = previous.current;
    const now = Date.now();

    if (connection.isWebSocketConnected && !before.isWebSocketConnected) {
      if (firstConnectedAt.current === undefined) {
        firstConnectedAt.current = now;
      } else {
        reconnectCount.current += 1;
      }
      diagnostics.record(
        firstConnectedAt.current === now
          ? "connection.connected"
          : "connection.reconnected",
        {
          status: "succeeded",
          message: `retries=${connection.connectionRetries}`,
        },
      );
    }

    if (!connection.isWebSocketConnected && before.isWebSocketConnected) {
      diagnostics.record("connection.disconnected", {
        level: "warn",
        status: "failed",
        errorCode: "CLIENT_WEBSOCKET_CLOSED",
        message: "The live connection closed.",
      });
    }

    if (connection.connectionRetries !== before.connectionRetries) {
      diagnostics.record("connection.retrying", {
        level: "warn",
        status: "started",
        attempt: connection.connectionRetries + 1,
      });
    }

    if (
      connection.inflightMutations !== before.inflightMutations ||
      connection.inflightActions !== before.inflightActions
    ) {
      diagnostics.record("connection.pending", {
        status: "started",
        message:
          `mutations=${connection.inflightMutations} ` +
          `actions=${connection.inflightActions}`,
      });
    }

    diagnostics.setConnection({
      configuredOrigin: process.env.EXPO_PUBLIC_CONVEX_URL,
      effectiveOrigin: client.url,
      loopbackCorrected: loopbackCorrected(
        process.env.EXPO_PUBLIC_CONVEX_URL,
        client.url,
      ),
      websocketConnected: connection.isWebSocketConnected,
      firstConnectedAt: firstConnectedAt.current,
      lastConnectedAt: connection.isWebSocketConnected
        ? (diagnostics.connection.lastConnectedAt ?? now)
        : diagnostics.connection.lastConnectedAt,
      reconnectCount: reconnectCount.current,
      connectionRetries: connection.connectionRetries,
      pendingMutations: connection.inflightMutations,
      pendingActions: connection.inflightActions,
    });
    previous.current = connection;
  }, [client.url, connection, diagnostics]);

  return null;
}
