import { useEffect, useRef } from "react";
import { useDiagnostics } from "./DiagnosticsProvider";

const STALL_MS = 10_000;

/**
 * Measures one screen's query: time to first result, a stall while connected,
 * and the difference between an unloaded query and a lost connection.
 */
export function useQueryDiagnostics(
  name: string,
  result: unknown,
  connected: boolean,
) {
  const { record } = useDiagnostics();
  const startedAt = useRef(Date.now());
  const sawResult = useRef(false);
  const wasUnavailable = useRef(false);
  const stalled = useRef(false);

  useEffect(() => {
    const loaded = result !== undefined;

    if (loaded) {
      if (!sawResult.current) {
        sawResult.current = true;
        stalled.current = false;
        record("query.first_result", {
          status: "succeeded",
          stage: name,
          durationMs: Date.now() - startedAt.current,
        });
      }
      if (wasUnavailable.current) {
        wasUnavailable.current = false;
        record("query.recovered", {
          status: "recovered",
          stage: name,
        });
      }
      return;
    }

    if (!connected && sawResult.current) {
      if (!wasUnavailable.current) {
        wasUnavailable.current = true;
        record("query.unavailable", {
          level: "warn",
          status: "failed",
          stage: name,
          errorCode: "CLIENT_QUERY_UNAVAILABLE",
          message: "A loaded query lost its connection.",
        });
      }
      return;
    }

    if (!connected || stalled.current) return;
    const timer = setTimeout(() => {
      stalled.current = true;
      record("query.stalled", {
        level: "warn",
        status: "failed",
        stage: name,
        durationMs: Date.now() - startedAt.current,
        errorCode: "CLIENT_QUERY_TIMEOUT",
        message: "The query has not produced a first result.",
      });
    }, STALL_MS);
    return () => clearTimeout(timer);
  }, [connected, name, record, result]);
}
