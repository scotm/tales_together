import jpeg from "jpeg-js";

// Provider JPEGs arrive around 1.2 MB at 1200×896. Re-encoding lands near
// 220 KB with no resize, which is plenty for a full-width chapter illustration.
// `sharp` is not an option: its native binary cannot load in Convex's runtime.
const JPEG_QUALITY = 55;

export interface CompressedImage {
  bytes: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
}

export function recompressJpeg(
  bytes: Uint8Array<ArrayBuffer>,
  quality: number = JPEG_QUALITY,
): CompressedImage {
  const decoded = jpeg.decode(bytes, { useTArray: true });
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
