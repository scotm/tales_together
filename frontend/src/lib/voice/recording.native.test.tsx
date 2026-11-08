/// <reference types="jest" />
import { AudioModule } from "expo-audio";
import { startRecording } from "./recording.native";

const mockDelete = jest.fn();
const mockRelease = jest.fn();
const mockRecord = jest.fn();
const mockStop = jest.fn();
const mockMode = jest.fn();
const mockPrepare = jest.fn();
const mockBuffer = new ArrayBuffer(100);
let mockPermission = true;
let mockRecording = false;
jest.mock("expo-audio", () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: (...args: unknown[]) => mockMode(...args),
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({
      granted: mockPermission,
    })),
    AudioRecorder: class {
      uri = "file:///cache/recording.m4a";
      get isRecording() {
        return mockRecording;
      }
      prepareToRecordAsync = mockPrepare;
      record(options: object) {
        mockRecording = true;
        mockRecord(options);
      }
      async stop() {
        mockRecording = false;
        mockStop();
      }
      release = mockRelease;
    },
  },
}));
jest.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    size = 100;
    delete = mockDelete;
    async arrayBuffer() {
      return mockBuffer;
    }
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockPermission = true;
  mockRecording = false;
  mockPrepare.mockResolvedValue(undefined);
  mockMode.mockResolvedValue(undefined);
});
it("records a bounded native clip and cleans the temporary file and recorder", async () => {
  const recording = await startRecording(new AbortController().signal);
  expect(AudioModule.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(mockRecord).toHaveBeenCalledWith({ forDuration: 20 });
  expect(await recording.stop()).toEqual({
    audio: mockBuffer,
    mimeType: "audio/mp4",
  });
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockMode).toHaveBeenLastCalledWith({ allowsRecording: false });
});
it("does not start recording after denied permission and releases it on cancellation", async () => {
  mockPermission = false;
  await expect(startRecording(new AbortController().signal)).rejects.toThrow(
    /permission was denied/,
  );
  expect(mockRecord).not.toHaveBeenCalled();
  mockPermission = true;
  const recording = await startRecording(new AbortController().signal);
  await recording.cancel();
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockRelease).toHaveBeenCalledTimes(1);
});
