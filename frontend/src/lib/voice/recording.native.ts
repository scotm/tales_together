import { AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { File } from "expo-file-system";
import type { RecordingHandle } from "./types";

export async function startRecording(
  signal: AbortSignal,
): Promise<RecordingHandle> {
  const permission = await AudioModule.requestRecordingPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Microphone permission was denied. You can type your idea instead.",
    );
  if (signal.aborted) throw new Error("Recording cancelled.");
  await setAudioModeAsync({
    allowsRecording: true,
    allowsBackgroundRecording: false,
    shouldPlayInBackground: false,
    playsInSilentMode: true,
  });
  const recorder = new AudioModule.AudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    bitRate: 64000,
  });
  let released = false;
  const cleanup = async () => {
    if (released) return;
    released = true;
    try {
      if (recorder.isRecording) await recorder.stop();
    } finally {
      const uri = recorder.uri;
      recorder.release();
      try {
        if (uri) {
          const file = new File(uri);
          if (file.exists) file.delete();
        }
      } finally {
        await setAudioModeAsync({ allowsRecording: false });
      }
    }
  };
  const abort = () => {
    void cleanup().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await recorder.prepareToRecordAsync();
    if (signal.aborted) throw new Error("Recording cancelled.");
    recorder.record({ forDuration: 20 });
  } catch (error) {
    signal.removeEventListener("abort", abort);
    await cleanup();
    throw error;
  }
  return {
    stop: async () => {
      try {
        if (released || signal.aborted) throw new Error("Recording cancelled.");
        if (recorder.isRecording) await recorder.stop();
        if (!recorder.uri)
          throw new Error(
            "The recording is empty. Try again or type your idea.",
          );
        const file = new File(recorder.uri);
        if (!file.size || file.size > 2 * 1024 * 1024)
          throw new Error("Record a shorter idea up to 20 seconds.");
        return { audio: await file.arrayBuffer(), mimeType: "audio/mp4" };
      } finally {
        signal.removeEventListener("abort", abort);
        await cleanup();
      }
    },
    cancel: async () => {
      signal.removeEventListener("abort", abort);
      await cleanup();
    },
  };
}
