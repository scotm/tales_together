import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { recompressImage } from "./compressImage";

function noiseJpeg(width = 64, height = 48): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const seed = (i / 4) % 97;
    data[i] = (seed * 7) % 256;
    data[i + 1] = (seed * 13) % 256;
    data[i + 2] = (seed * 29) % 256;
    data[i + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ data, width, height }, 95).data);
}

describe("image recompression", () => {
  it("keeps the pixel dimensions and loses weight", () => {
    const original = noiseJpeg();
    const smaller = recompressImage(original);

    expect(smaller.width).toBe(64);
    expect(smaller.height).toBe(48);
    expect(smaller.bytes.length).toBeLessThan(original.length);
  });

  it("a lower quality always produces fewer bytes", () => {
    const source = noiseJpeg(96, 96);
    const high = recompressImage(source, 90).bytes.length;
    const low = recompressImage(source, 30).bytes.length;
    expect(low).toBeLessThan(high);
  });

  it("does not throw on an image it cannot improve", () => {
    const tiny = new Uint8Array(
      jpeg.encode(
        {
          data: new Uint8Array(4 * 4 * 4).fill(255),
          width: 4,
          height: 4,
        },
        20,
      ).data,
    );
    expect(() => recompressImage(tiny)).not.toThrow();
  });

  it("converts a portrait PNG to JPEG without cropping or distorting it", () => {
    const png = new PNG({ width: 16, height: 24 });
    png.data.fill(255);
    const result = recompressImage(new Uint8Array(PNG.sync.write(png)));
    const decoded = jpeg.decode(result.bytes);
    expect([decoded.width, decoded.height]).toEqual([16, 24]);
    expect(Array.from(result.bytes.slice(0, 3))).toEqual([255, 216, 255]);
  });

  it("flattens transparent PNG pixels onto white rather than black", () => {
    const png = new PNG({ width: 8, height: 8 });
    png.data.fill(0);
    const result = recompressImage(new Uint8Array(PNG.sync.write(png)));
    const decoded = jpeg.decode(result.bytes);
    expect(Array.from(decoded.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
  });
});
