import {
  createDiagnosticEvent,
  type DiagnosticEvent,
  type DiagnosticEventInput,
} from "./contract";

/** A sink never throws into the code being observed. */
export interface DiagnosticSink {
  emit(event: DiagnosticEvent): void | Promise<void>;
}

export interface DiagnosticLogger {
  record(input: DiagnosticEventInput): DiagnosticEvent | null;
}

function safelyEmit(sink: DiagnosticSink, event: DiagnosticEvent): void {
  try {
    const result = sink.emit(event);
    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch {
    // A broken sink must not change provider retries, storage writes or UI.
  }
}

/** JSON lines are greppable in Convex and browser consoles alike. */
export function createConsoleSink(
  write: (line: string) => void = (line) => console.log(line),
): DiagnosticSink {
  return {
    emit(event) {
      write(JSON.stringify({ diagnostics: event }));
    },
  };
}

export function createTestSink(): DiagnosticSink & {
  events: DiagnosticEvent[];
} {
  const events: DiagnosticEvent[] = [];
  return {
    events,
    emit(event) {
      events.push(event);
    },
  };
}

export function createDiagnosticLogger(
  sinks: DiagnosticSink[],
  now: () => number = Date.now,
): DiagnosticLogger {
  let sequence = 0;
  return {
    record(input) {
      sequence += 1;
      const event = createDiagnosticEvent({
        ...input,
        sequence: input.sequence ?? sequence,
        timestamp: input.timestamp ?? now(),
      });
      if (!event) return null;
      for (const sink of sinks) safelyEmit(sink, event);
      return event;
    },
  };
}
