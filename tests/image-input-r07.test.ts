import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { imageBytes } from "../apps/api/src/youcamImage";

// Real, nonpersonal RGB PNGs, including valid chunk CRCs. No provider/network.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(kind: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(kind), data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  body.copy(result, 4);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function syntheticPng(width: number, height: number) {
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(height * stride);
  let state = 0x8f1bbcdc;
  for (let index = 0; index < pixels.length; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = state & 255;
  }
  for (let y = 0; y < height; y++) pixels[y * stride] = 0;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("R07 independent image-input boundaries", () => {
  it("accepts a real PNG near the advertised 4 MiB decoded limit without regex stack overflow", () => {
    const png = syntheticPng(1100, 1200);
    expect(png.length).toBeGreaterThan(3_900_000);
    expect(png.length).toBeLessThanOrEqual(4 * 1024 * 1024);
    const decoded = imageBytes(png.toString("base64"), "image/png");
    expect(Buffer.from(decoded).equals(png)).toBe(true);
  });

  it("rejects decoded payloads above 4 MiB", () => {
    const tooLarge = Buffer.alloc(4 * 1024 * 1024 + 1);
    tooLarge.set([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() => imageBytes(tooLarge.toString("base64"), "image/png")).toThrow(
      /4 MB/,
    );
  });

  it.each([
    ["internal padding", "A".repeat(132) + "AA=A"],
    ["padding after a complete quartet", "A".repeat(136) + "="],
    ["three padding characters", "A".repeat(133) + "==="],
    ["unpaired final sextet", "A".repeat(137)],
    ["invalid character", "A".repeat(132) + "A$AA"],
    ["whitespace", "A".repeat(132) + "A AA"],
    ["URL-safe alphabet", "A".repeat(132) + "A-_A"],
  ])("rejects malformed base64: %s", (_label, encoded) => {
    expect(() => imageBytes(encoded, "image/png")).toThrow(
      "Malformed image encoding.",
    );
  });

  it("accepts standard base64 with either valid padding length", () => {
    for (const size of [121, 122]) {
      const bytes = Buffer.alloc(size);
      bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(imageBytes(bytes.toString("base64"), "image/png")).toEqual(
        new Uint8Array(bytes),
      );
    }
  });
});
