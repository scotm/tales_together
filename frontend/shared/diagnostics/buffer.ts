import {
  createDiagnosticEvent,
  type DiagnosticEvent,
  type DiagnosticEventInput,
  eventBytes,
  MAX_EVENT_BYTES,
} from "./contract";

export const CLIENT_EVENT_LIMIT = 500;
export const CLIENT_BUFFER_BYTES = 256 * 1024;

/**
 * Bounded in-memory ring. Never grows past the event count or byte budget;
 * recording a connection failure must not need a Convex mutation.
 */
export class DiagnosticBuffer {
  private events: DiagnosticEvent[] = [];
  private bytes = 0;
  private readonly ids = new Set<string>();

  constructor(
    private readonly maxEvents = CLIENT_EVENT_LIMIT,
    private readonly maxBytes = CLIENT_BUFFER_BYTES,
  ) {}

  add(input: DiagnosticEventInput): DiagnosticEvent | null {
    const event = createDiagnosticEvent(input);
    if (!event) return null;
    if (this.ids.has(event.eventId)) return event;

    const size = eventBytes(event);
    if (size > MAX_EVENT_BYTES) return null;

    this.events.push(event);
    this.ids.add(event.eventId);
    this.bytes += size;
    this.trim();
    return event;
  }

  list(): DiagnosticEvent[] {
    return [...this.events];
  }

  get size(): number {
    return this.events.length;
  }

  get byteCount(): number {
    return this.bytes;
  }

  clear(): void {
    this.events = [];
    this.ids.clear();
    this.bytes = 0;
  }

  private trim(): void {
    while (this.events.length > this.maxEvents || this.bytes > this.maxBytes) {
      const removed = this.events.shift();
      if (!removed) break;
      this.ids.delete(removed.eventId);
      this.bytes -= eventBytes(removed);
    }
  }
}
