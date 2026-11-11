import { describe, expect, it } from 'vitest';
import {
  buildWatchfaceBinary,
  chunkPayloadFrames,
  computeCrc16,
  encodeRgbaToRgb565,
  hexStringToBytes,
} from './protocol';

describe('Watchface binary protocol helpers', () => {
  it('encodes RGBA pixels to RGB565 little and big endian accurately', () => {
    // Pure red (255,0,0), pure green (0,255,0), pure blue (0,0,255)
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]);

    const le = encodeRgbaToRgb565(rgba, 3, 1, 'little');
    expect(Array.from(le)).toEqual([0x00, 0xf8, 0xe0, 0x07, 0x1f, 0x00]);

    const be = encodeRgbaToRgb565(rgba, 3, 1, 'big');
    expect(Array.from(be)).toEqual([0xf8, 0x00, 0x07, 0xe0, 0x00, 0x1f]);
  });

  it('builds a valid FR30 binary container with CRC-16 checksum', () => {
    const rgba = new Uint8ClampedArray(80 * 160 * 4);
    rgba.fill(255);

    const { bytes, crc16, pixelBytesLength } = buildWatchfaceBinary(rgba, 2, 'little');
    expect(pixelBytesLength).toBe(80 * 160 * 2);
    expect(bytes.length).toBe(20 + 80 * 160 * 2);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('FR30');
    expect(bytes[5]).toBe(2);

    const view = new DataView(bytes.buffer);
    expect(view.getUint16(6, true)).toBe(80);
    expect(view.getUint16(8, true)).toBe(160);
    expect(view.getUint32(12, true)).toBe(pixelBytesLength);
    expect(view.getUint16(16, true)).toBe(crc16);
    expect(crc16).toBe(computeCrc16(bytes.subarray(20)));
  });

  it('chunks payloads into MTU-bounded frames with sequence headers', () => {
    const payload = new Uint8Array(40).map((_, idx) => idx);
    const frames = chunkPayloadFrames(payload, 20, 0x42);
    // 20 - 4 = 16 bytes per chunk -> 16 + 16 + 8 = 3 frames
    expect(frames).toHaveLength(3);
    expect(frames[0].slice(0, 4)).toEqual(new Uint8Array([0xaa, 0x42, 0x00, 0x00]));
    expect(frames[1].slice(0, 4)).toEqual(new Uint8Array([0xaa, 0x42, 0x01, 0x00]));
    expect(frames[2].length).toBe(12);
  });

  it('parses valid hex strings and rejects malformed input', () => {
    expect(Array.from(hexStringToBytes('AA 10 FF'))).toEqual([0xaa, 0x10, 0xff]);
    expect(() => hexStringToBytes('AAB')).toThrow();
  });
});

