import { describe, expect, it, vi } from 'vitest';
import { MockReflexTransport } from './mockTransport';
import { buildWatchfaceBinary, DEFAULT_PROTOCOL_MAPPING } from './protocol';
import type { PacketLogEntry } from './types';

describe('MockReflexTransport', () => {
  it('connects, discovers GATT services, and flashes a watchface with CRC verification', async () => {
    const logs: PacketLogEntry[] = [];
    const onBuzz = vi.fn();
    const onSlotActivated = vi.fn();

    const transport = new MockReflexTransport({
      onLog: (entry) => logs.push(entry),
      onBuzz,
      onSlotActivated,
    });

    const info = await transport.connect();
    expect(info.name).toContain('Reflex 3.0');
    expect(info.mode).toBe('mock');

    const services = await transport.discoverServices();
    expect(services.length).toBeGreaterThanOrEqual(3);

    await transport.findBand();
    expect(onBuzz).toHaveBeenCalledTimes(1);

    const rgba = new Uint8ClampedArray(80 * 160 * 4);
    rgba.fill(128);
    const { bytes, crc16 } = buildWatchfaceBinary(rgba, 1, 'little');

    const progressUpdates: number[] = [];
    const result = await transport.uploadWatchface(
      bytes,
      1,
      { ...DEFAULT_PROTOCOL_MAPPING, mtuPayloadSize: 244 },
      (progress) => progressUpdates.push(progress.percent)
    );

    expect(result.verified).toBe(true);
    expect(result.crc16).toBe(crc16);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    expect(onSlotActivated).toHaveBeenCalledWith(1);
    expect(logs.some((l) => l.channel === 'WF_COMMIT')).toBe(true);
  });
});

