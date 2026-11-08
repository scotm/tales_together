export interface RecordingClip {
  audio: ArrayBuffer;
  mimeType: string;
}
export interface RecordingHandle {
  stop(): Promise<RecordingClip>;
  cancel(): Promise<void>;
}
