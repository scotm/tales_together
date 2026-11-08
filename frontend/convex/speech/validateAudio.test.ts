import { describe, expect, test } from "vitest";
import recordings from "./fixtures/recordings.json";
import { validateAudio } from "./validateAudio";

const bytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
function wav(seconds: number) {
  const data = new Uint8Array(44 + seconds * 16000 * 2);
  const view = new DataView(data.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((char, index) => {
      data[offset + index] = char.charCodeAt(0);
    });
  text(0, "RIFF");
  view.setUint32(4, data.length - 8, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data.length - 44, true);
  return data;
}
describe("bounded audio validation", () => {
  test("accepts actual AAC/MP4 and durationless Opus/WebM recordings", async () => {
    expect(
      await validateAudio(bytes(recordings.m4a), "audio/mp4"),
    ).toMatchObject({ mime: "audio/mp4" });
    const webm = await validateAudio(
      bytes(recordings.webm),
      "audio/webm;codecs=opus",
    );
    expect(webm.mime).toBe("audio/webm");
    expect(webm.duration).toBeGreaterThan(0.9);
    expect(webm.duration).toBeLessThan(1.3);
  });
  test("checks the actual bytes and duration instead of trusting client labels", async () => {
    expect((await validateAudio(wav(1), "audio/wav")).duration).toBe(1);
    await expect(
      validateAudio(bytes(recordings.longWebm), "audio/webm"),
    ).rejects.toThrow(/20 seconds/);
    await expect(validateAudio(wav(21), "audio/wav")).rejects.toThrow(
      /20 seconds/,
    );
    await expect(validateAudio(wav(1), "audio/mp4")).rejects.toThrow(
      /did not match/,
    );
    await expect(
      validateAudio(new Uint8Array(2 * 1024 * 1024 + 1), "audio/wav"),
    ).rejects.toThrow(/2 MiB/);
    await expect(
      validateAudio(new Uint8Array(200), "audio/wav"),
    ).rejects.toThrow(/not supported/);
    await expect(
      validateAudio(bytes(recordings.webm).slice(0, 48), "audio/webm"),
    ).rejects.toThrow();
  });
});
