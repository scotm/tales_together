/// <reference types="jest" />
import { Blob as NodeBlob } from "node:buffer";
import { startRecording } from "./recording.web";

const mockTrackStop = jest.fn();
const mockGetMedia = jest.fn();
const mockInstances: FakeRecorder[] = [];
class FakeRecorder {
  static isTypeSupported(type: string) {
    return type.startsWith("audio/webm");
  }
  state = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable?: (event: { data: Blob }) => void;
  onstop?: () => void;
  onerror?: () => void;
  constructor() {
    mockInstances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new NodeBlob([new Uint8Array([1, 2, 3])]) as unknown as Blob,
    });
    this.onstop?.();
  }
}
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
const originalRecorder = Object.getOwnPropertyDescriptor(
  globalThis,
  "MediaRecorder",
);
const originalSecure = Object.getOwnPropertyDescriptor(
  globalThis,
  "isSecureContext",
);
const originalBlob = globalThis.Blob;
beforeEach(() => {
  jest.clearAllMocks();
  mockInstances.length = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: mockGetMedia } },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: FakeRecorder,
  });
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: true,
  });
  globalThis.Blob = NodeBlob as unknown as typeof Blob;
  mockGetMedia.mockResolvedValue({
    getTracks: () => [{ stop: mockTrackStop }],
  });
});
afterEach(() => {
  for (const [key, descriptor] of [
    ["navigator", originalNavigator],
    ["MediaRecorder", originalRecorder],
    ["isSecureContext", originalSecure],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  globalThis.Blob = originalBlob;
});
it("uses supported MediaRecorder audio and releases microphone tracks before returning bytes", async () => {
  const recording = await startRecording(new AbortController().signal);
  const clip = await recording.stop();
  expect(new Uint8Array(clip.audio)).toEqual(new Uint8Array([1, 2, 3]));
  expect(clip.mimeType).toBe("audio/webm;codecs=opus");
  expect(mockTrackStop).toHaveBeenCalled();
});
it("releases a stream whose permission resolves after cancellation without starting capture", async () => {
  const controller = new AbortController();
  let grant!: (value: unknown) => void;
  mockGetMedia.mockImplementation(
    () =>
      new Promise((resolve) => {
        grant = resolve;
      }),
  );
  const pending = expect(startRecording(controller.signal)).rejects.toThrow(
    /cancelled/,
  );
  controller.abort();
  grant({ getTracks: () => [{ stop: mockTrackStop }] });
  await pending;
  expect(mockInstances).toHaveLength(0);
  expect(mockTrackStop).toHaveBeenCalledTimes(1);
});
it("blocks insecure browser capture and keeps cancellation from returning audio", async () => {
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: false,
  });
  await expect(startRecording(new AbortController().signal)).rejects.toThrow(
    /secure browser/,
  );
  expect(mockGetMedia).not.toHaveBeenCalled();
  Object.defineProperty(globalThis, "isSecureContext", {
    configurable: true,
    value: true,
  });
  const controller = new AbortController();
  const recording = await startRecording(controller.signal);
  await recording.cancel();
  await expect(recording.stop()).rejects.toThrow(/cancelled/);
  expect(mockTrackStop).toHaveBeenCalled();
});
