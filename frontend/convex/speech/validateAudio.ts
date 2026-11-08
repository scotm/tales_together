"use node";
import { parseBuffer, TrackType } from "music-metadata";
import { AUDIO_MAX_BYTES, AUDIO_MAX_SECONDS } from "../lib/heroIdeaConfig";

/** Count Opus packet durations as well as container timestamps (Chrome omits duration). */
function webmSeconds(data: Uint8Array) {
  let seconds = 0;
  let packets = 0;
  const vint = (offset: number, id: boolean) => {
    const first = data[offset];
    if (!first) throw new Error("Invalid WebM.");
    let length = 1;
    let mask = 128;
    while (!(first & mask)) {
      length++;
      mask >>= 1;
    }
    if (length > (id ? 4 : 8) || offset + length > data.length)
      throw new Error("Invalid WebM.");
    let value = id ? first : first & (mask - 1);
    let unknown = !id && value === mask - 1;
    for (let i = 1; i < length; i++) {
      value = value * 256 + data[offset + i];
      unknown = unknown && data[offset + i] === 255;
    }
    return { length, value, unknown };
  };
  const walk = (start: number, end: number, depth: number) => {
    if (depth > 8) throw new Error("Invalid WebM nesting.");
    let offset = start;
    while (offset < end) {
      const id = vint(offset, true);
      offset += id.length;
      const size = vint(offset, false);
      offset += size.length;
      const next = size.unknown ? end : offset + size.value;
      if (next > end || next < offset) throw new Error("Invalid WebM size.");
      if ([0x18538067, 0x1f43b675, 0xa0].includes(id.value))
        walk(offset, next, depth + 1);
      if ([0xa3, 0xa1].includes(id.value)) {
        const track = vint(offset, false);
        const flags = data[offset + track.length + 2];
        if (flags & 6)
          throw new Error("Unsupported laced audio. Try another recording.");
        const packet = offset + track.length + 3;
        if (packet >= next) throw new Error("Empty audio packet.");
        const toc = data[packet];
        const config = toc >> 3;
        const frameMs =
          config >= 16
            ? 2.5 * 2 ** (config & 3)
            : config >= 12
              ? 10 * 2 ** (config & 1)
              : (config & 3) === 3
                ? 60
                : 10 * 2 ** (config & 3);
        const code = toc & 3;
        const frames = code === 0 ? 1 : code === 3 ? data[packet + 1] & 63 : 2;
        if (!frames || frames * frameMs > 120)
          throw new Error("Invalid Opus packet.");
        seconds += (frames * frameMs) / 1000;
        packets++;
      }
      offset = next;
    }
  };
  walk(0, data.length, 0);
  if (!packets) throw new Error("No audio packets.");
  return seconds;
}
export async function validateAudio(bytes: Uint8Array, declaredMime: string) {
  if (bytes.length < 44 || bytes.length > AUDIO_MAX_BYTES)
    throw new Error("Record a short idea up to 20 seconds and 2 MiB.");
  const ascii = (start: number, count: number) =>
    String.fromCharCode(...bytes.slice(start, start + count));
  let mime: string;
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") mime = "audio/wav";
  else if (ascii(4, 4) === "ftyp") mime = "audio/mp4";
  else if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    mime = "audio/webm";
  else
    throw new Error(
      "This recording format is not supported. Try recording again or type your idea.",
    );
  const claimed = declaredMime.split(";")[0].toLowerCase();
  if (
    claimed !== mime &&
    !(mime === "audio/mp4" && ["audio/m4a", "audio/x-m4a"].includes(claimed))
  )
    throw new Error("The recording format did not match its contents.");
  try {
    const metadata = await parseBuffer(
      bytes,
      { mimeType: mime, size: bytes.length },
      {
        duration: true,
        skipCovers: true,
        maxMemoryAllocation: AUDIO_MAX_BYTES,
      },
    );
    if (
      !metadata.format.codec ||
      !metadata.format.sampleRate ||
      !metadata.format.numberOfChannels ||
      metadata.format.numberOfChannels > 2 ||
      metadata.format.trackInfo?.some(
        (track) => track.type === TrackType.video,
      ) ||
      metadata.format.trackInfo?.filter(
        (track) => track.type === TrackType.audio,
      ).length > 1
    )
      throw new Error("Not a voice recording.");
    let duration = metadata.format.duration;
    if (mime === "audio/webm") {
      if (!metadata.format.codec.toLowerCase().includes("opus"))
        throw new Error("Unsupported WebM codec.");
      duration = Math.max(duration ?? 0, webmSeconds(bytes));
    }
    // Encoder padding is allowed, but unmeasurable files never reach the provider.
    if (
      !duration ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > AUDIO_MAX_SECONDS + 0.25
    )
      throw new Error("Recording exceeds the duration limit.");
    return { mime, duration };
  } catch {
    throw new Error(
      "Use a valid voice recording up to 20 seconds, or type your idea instead.",
    );
  }
}
