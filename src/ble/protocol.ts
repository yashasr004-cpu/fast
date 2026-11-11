import { REFLEX_HEIGHT, REFLEX_WIDTH } from '../types/watchface';

export const DEFAULT_PROTOCOL_MAPPING = {
  serviceUuid: '0000feea-0000-1000-8000-00805f9b34fb',
  writeCharacteristicUuid: '0000fee1-0000-1000-8000-00805f9b34fb',
  notifyCharacteristicUuid: '0000fee2-0000-1000-8000-00805f9b34fb',
  mtuPayloadSize: 20,
  endianness: 'little' as const,
};

/**
 * Computes standard CRC-16/CCITT-FALSE over a byte array.
 */
export function computeCrc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Converts RGBA ImageData pixels into 16-bit RGB565 bytes (width * height * 2).
 */
export function encodeRgbaToRgb565(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  endianness: 'little' | 'big' = 'little'
): Uint8Array {
  const pixelCount = width * height;
  if (rgba.length < pixelCount * 4) {
    throw new Error(
      `Expected at least ${pixelCount * 4} RGBA bytes, got ${rgba.length}`
    );
  }

  const out = new Uint8Array(pixelCount * 2);
  for (let i = 0; i < pixelCount; i += 1) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const rgb565 = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);

    if (endianness === 'little') {
      out[i * 2] = rgb565 & 0xff;
      out[i * 2 + 1] = (rgb565 >> 8) & 0xff;
    } else {
      out[i * 2] = (rgb565 >> 8) & 0xff;
      out[i * 2 + 1] = rgb565 & 0xff;
    }
  }
  return out;
}

/**
 * Builds a structured watchface container binary:
 *   [0..3]   Magic "FR30"
 *   [4]      Version (0x01)
 *   [5]      Slot ID (0..3)
 *   [6..7]   Width (uint16 LE)
 *   [8..9]   Height (uint16 LE)
 *   [10]     Pixel format (0x01 = RGB565-LE, 0x02 = RGB565-BE)
 *   [11]     Reserved (0x00)
 *   [12..15] Payload byte length (uint32 LE)
 *   [16..17] Payload CRC-16/CCITT (uint16 LE)
 *   [18..19] Header flags (0x0000)
 *   [20..]   RGB565 pixel data
 */
export function buildWatchfaceBinary(
  rgba: Uint8ClampedArray,
  slotId: number,
  endianness: 'little' | 'big' = 'little',
  width = REFLEX_WIDTH,
  height = REFLEX_HEIGHT
): { bytes: Uint8Array; crc16: number; pixelBytesLength: number } {
  const pixelBytes = encodeRgbaToRgb565(rgba, width, height, endianness);
  const crc16 = computeCrc16(pixelBytes);
  const headerSize = 20;
  const total = new Uint8Array(headerSize + pixelBytes.length);
  const view = new DataView(total.buffer);

  total[0] = 0x46; // 'F'
  total[1] = 0x52; // 'R'
  total[2] = 0x33; // '3'
  total[3] = 0x30; // '0'
  total[4] = 0x01;
  total[5] = slotId & 0xff;
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  total[10] = endianness === 'little' ? 0x01 : 0x02;
  total[11] = 0x00;
  view.setUint32(12, pixelBytes.length, true);
  view.setUint16(16, crc16, true);
  view.setUint16(18, 0x0000, true);

  total.set(pixelBytes, headerSize);
  return { bytes: total, crc16, pixelBytesLength: pixelBytes.length };
}

/**
 * Splits a binary payload into MTU-bounded frames with a 4-byte framing header:
 * [0xAA, opcode, seqLow, seqHigh, ...chunkData]
 */
export function chunkPayloadFrames(
  payload: Uint8Array,
  mtuPayloadSize: number,
  opcode = 0x42
): Uint8Array[] {
  const safeChunkSize = Math.max(8, Math.min(500, mtuPayloadSize - 4));
  const frames: Uint8Array[] = [];
  let seq = 0;

  for (let offset = 0; offset < payload.length; offset += safeChunkSize) {
    const slice = payload.subarray(offset, offset + safeChunkSize);
    const frame = new Uint8Array(4 + slice.length);
    frame[0] = 0xaa;
    frame[1] = opcode & 0xff;
    frame[2] = seq & 0xff;
    frame[3] = (seq >> 8) & 0xff;
    frame.set(slice, 4);
    frames.push(frame);
    seq += 1;
  }

  return frames;
}

export function bytesToHex(bytes: Uint8Array, maxBytes = 24): string {
  const limit = Math.min(bytes.length, maxBytes);
  const parts: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    parts.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
  }
  const suffix = bytes.length > maxBytes ? ` … (+${bytes.length - maxBytes}B)` : '';
  return parts.join(' ') + suffix;
}

export function hexStringToBytes(input: string): Uint8Array {
  const cleaned = input.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) {
    throw new Error('Enter an even number of hexadecimal characters (e.g. AA 01 02 FF).');
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

