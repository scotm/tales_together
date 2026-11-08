import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import { DiagnosticBuffer } from "../../../shared/diagnostics/buffer";
import {
  classifyError,
  createEventId,
  type DiagnosticEvent,
  type DiagnosticEventInput,
} from "../../../shared/diagnostics/contract";
import {
  buildSupportBundle,
  type CapabilityCheck,
  type ConnectionSummary,
  type SupportBundle,
  type SupportIdentity,
  supportSummary,
} from "../../../shared/diagnostics/support";
import { clientEnvironment, clientIdentity } from "./identity";

type EventFields = Partial<
  Omit<DiagnosticEventInput, "name" | "source" | "sessionId">
>;

export interface DiagnosticsApi {
  identity: SupportIdentity;
  sessionId: string;
  environment: string;
  record(name: string, fields?: EventFields): DiagnosticEvent | null;
  track<T>(name: string, run: (operationId: string) => Promise<T>): Promise<T>;
  events(): DiagnosticEvent[];
  clear(): void;
  connection: ConnectionSummary;
  setConnection(update: Partial<ConnectionSummary>): void;
  checks: CapabilityCheck[];
  addCheck(check: CapabilityCheck): void;
  bundle(): SupportBundle;
  summary(): string;
}

const emptyConnection: ConnectionSummary = {
  websocketConnected: false,
  reconnectCount: 0,
  connectionRetries: 0,
  pendingMutations: 0,
  pendingActions: 0,
};

const fallbackIdentity: SupportIdentity = {
  appVersion: "unknown",
  buildId: "unknown",
  platform: "unknown",
  osVersion: "unknown",
  runtime: "unknown",
};

const noop: DiagnosticsApi = {
  identity: fallbackIdentity,
  sessionId: "unknown",
  environment: "unknown",
  record: () => null,
  track: (_name, run) => run("client-unknown"),
  events: () => [],
  clear: () => {},
  connection: emptyConnection,
  setConnection: () => {},
  checks: [],
  addCheck: () => {},
  bundle: () =>
    buildSupportBundle({
      sessionId: "unknown",
      identity: fallbackIdentity,
      connection: emptyConnection,
      checks: [],
      events: [],
    }),
  summary: () => "Diagnostics are not available.",
};

const DiagnosticsContext = createContext<DiagnosticsApi | null>(null);

function sourceForPlatform(): DiagnosticEventInput["source"] {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

export function DiagnosticsProvider({ children }: { children: ReactNode }) {
  const [identity] = useState(() => clientIdentity());
  const [environment] = useState(() => clientEnvironment());
  const [sessionId] = useState(() => createEventId("session"));
  const buffer = useRef(new DiagnosticBuffer());
  const [, setRevision] = useState(0);
  const [connection, setConnectionState] =
    useState<ConnectionSummary>(emptyConnection);
  const [checks, setChecks] = useState<CapabilityCheck[]>([]);

  const record = useCallback(
    (name: string, fields: EventFields = {}) => {
      const event = buffer.current.add({
        name,
        level: "info",
        source: sourceForPlatform(),
        sessionId,
        environment,
        appVersion: identity.appVersion,
        buildId: identity.buildId,
        platform: identity.platform,
        osVersion: identity.osVersion,
        route: identity.route,
        ...fields,
      });
      if (event) setRevision((value) => value + 1);
      return event;
    },
    [environment, identity, sessionId],
  );

  const track = useCallback(
    async <T,>(
      name: string,
      run: (operationId: string) => Promise<T>,
    ): Promise<T> => {
      const startedAt = Date.now();
      const operationId = createEventId("client");
      record("operation.started", {
        status: "started",
        stage: name,
        operationId,
      });
      try {
        const result = await run(operationId);
        record("operation.succeeded", {
          status: "succeeded",
          stage: name,
          operationId,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (cause) {
        const classified = classifyError(cause);
        record("operation.failed", {
          level: "error",
          status: "failed",
          stage: name,
          operationId,
          durationMs: Date.now() - startedAt,
          errorCode: classified.code,
          message: classified.safeMessage,
          retryable: classified.retryable,
        });
        throw cause;
      }
    },
    [record],
  );

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onRejection = (event: PromiseRejectionEvent) => {
        const classified = classifyError(event.reason);
        record("operation.failed", {
          level: "error",
          status: "failed",
          stage: "unhandled_rejection",
          errorCode: classified.code,
          message: classified.safeMessage,
        });
      };
      window.addEventListener("unhandledrejection", onRejection);
      return () =>
        window.removeEventListener("unhandledrejection", onRejection);
    }

    const errorUtils = (
      globalThis as {
        ErrorUtils?: {
          getGlobalHandler?: () => (error: unknown, fatal?: boolean) => void;
          setGlobalHandler?: (
            handler: (error: unknown, fatal?: boolean) => void,
          ) => void;
        };
      }
    ).ErrorUtils;
    const previous = errorUtils?.getGlobalHandler?.();
    errorUtils?.setGlobalHandler?.((error, fatal) => {
      const classified = classifyError(error);
      record("operation.failed", {
        level: "error",
        status: "failed",
        stage: fatal ? "native_fatal_error" : "native_js_error",
        errorCode: classified.code,
        message: classified.safeMessage,
      });
      previous?.(error, fatal);
    });
    return () => {
      if (previous) errorUtils?.setGlobalHandler?.(previous);
    };
  }, [record]);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => {
        record("operation.lifecycle", {
          status: "succeeded",
          stage: `visibility_${document.visibilityState}`,
        });
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () =>
        document.removeEventListener("visibilitychange", onVisibility);
    }
    const subscription = AppState.addEventListener("change", (state) => {
      record("operation.lifecycle", {
        status: "succeeded",
        stage: `app_${state.toLowerCase()}`,
      });
    });
    return () => subscription.remove();
  }, [record]);

  const clear = useCallback(() => {
    buffer.current.clear();
    setRevision((value) => value + 1);
  }, []);

  const setConnection = useCallback((update: Partial<ConnectionSummary>) => {
    setConnectionState((current) => {
      const next = { ...current, ...update };
      return (Object.keys(next) as (keyof ConnectionSummary)[]).every(
        (key) => next[key] === current[key],
      )
        ? current
        : next;
    });
  }, []);

  const addCheck = useCallback((check: CapabilityCheck) => {
    setChecks((current) => [...current, check].slice(-8));
  }, []);

  const api: DiagnosticsApi = {
    identity,
    sessionId,
    environment,
    record,
    track,
    events: () => buffer.current.list(),
    clear,
    connection,
    setConnection,
    checks,
    addCheck,
    bundle: () =>
      buildSupportBundle({
        sessionId,
        identity,
        connection,
        checks,
        events: buffer.current.list(),
      }),
    summary: () =>
      supportSummary(
        buildSupportBundle({
          sessionId,
          identity,
          connection,
          checks,
          events: buffer.current.list(),
        }),
      ),
  };

  return (
    <DiagnosticsContext.Provider value={api}>
      {children}
    </DiagnosticsContext.Provider>
  );
}

/** Falls back to a no-op outside the provider so screens stay testable. */
export function useDiagnostics(): DiagnosticsApi {
  return useContext(DiagnosticsContext) ?? noop;
}
