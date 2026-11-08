import type { RecordingHandle } from "./types";

export async function startRecording(
  signal: AbortSignal,
): Promise<RecordingHandle> {
  if (
    !globalThis.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined"
  ) {
    throw new Error(
      "Recording needs a secure browser connection. You can type your idea instead.",
    );
  }
  const mimeType = ["audio/webm;codecs=opus", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!mimeType)
    throw new Error(
      "Recording is unavailable in this browser. You can type instead.",
    );
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const release = () =>
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  if (signal.aborted) {
    release();
    throw new Error("Recording cancelled.");
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 64000,
    });
  } catch {
    release();
    throw new Error("Could not open the microphone. You can type instead.");
  }
  let chunks: Blob[] = [];
  let size = 0;
  let cancelled = false;
  let tooLarge = false;
  let resolve!: (clip: { audio: ArrayBuffer; mimeType: string }) => void;
  let reject!: (error: Error) => void;
  const completed = new Promise<{ audio: ArrayBuffer; mimeType: string }>(
    (done, failed) => {
      resolve = done;
      reject = failed;
    },
  );
  void completed.catch(() => {});
  const abort = () => {
    cancelled = true;
    if (recorder.state !== "inactive") recorder.stop();
    release();
  };
  signal.addEventListener("abort", abort, { once: true });
  recorder.ondataavailable = (event) => {
    size += event.data.size;
    if (size > 2 * 1024 * 1024) {
      tooLarge = true;
      if (recorder.state !== "inactive") recorder.stop();
      return;
    }
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onerror = () => {
    release();
    chunks = [];
    signal.removeEventListener("abort", abort);
    reject(
      new Error("The recording stopped unexpectedly. You can type your idea."),
    );
  };
  recorder.onstop = async () => {
    release();
    signal.removeEventListener("abort", abort);
    try {
      if (cancelled || tooLarge || !size)
        throw new Error(
          cancelled
            ? "Recording cancelled."
            : "Record a short, clear idea up to 20 seconds.",
        );
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      chunks = [];
      resolve({ audio: await blob.arrayBuffer(), mimeType: blob.type });
    } catch (error) {
      chunks = [];
      reject(error instanceof Error ? error : new Error("Recording failed."));
    }
  };
  try {
    recorder.start(250);
  } catch {
    release();
    signal.removeEventListener("abort", abort);
    throw new Error("Could not start recording. You can type instead.");
  }
  return {
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
      return completed;
    },
    cancel: async () => {
      abort();
      chunks = [];
      signal.removeEventListener("abort", abort);
    },
  };
}
