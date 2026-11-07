"use node";

import jpeg from "jpeg-js";
import { PNG } from "pngjs";

// Provider JPEGs arrive around 1.2 MB at 1200×896. Re-encoding lands near
// 220 KB with no resize, which is plenty for a full-width chapter illustration.
// `sharp` is not an option: its native binary cannot load in Convex's runtime.
const JPEG_QUALITY = 55;

export interface CompressedImage {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

export function recompressImage(
  bytes: Uint8Array<ArrayBuffer>,
  quality: number = JPEG_QUALITY,
): CompressedImage {
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  const isPng = pngSignature.every((byte, index) => bytes[index] === byte);
  const decoded = isPng
    ? PNG.sync.read(Buffer.from(bytes))
    : jpeg.decode(bytes, { useTArray: true });
  // JPEG has no alpha channel. Composite transparent PNGs onto paper-white.
  if (isPng) {
    for (let i = 0; i < decoded.data.length; i += 4) {
      const alpha = (decoded.data[i + 3] ?? 255) / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        decoded.data[i + channel] = Math.round(
          (decoded.data[i + channel] ?? 0) * alpha + 255 * (1 - alpha),
        );
      }
      decoded.data[i + 3] = 255;
    }
  }
  const encoded = jpeg.encode(
    { data: decoded.data, width: decoded.width, height: decoded.height },
    quality,
  );

  return {
    bytes: new Uint8Array(encoded.data),
    width: decoded.width,
    height: decoded.height,
  };
}
