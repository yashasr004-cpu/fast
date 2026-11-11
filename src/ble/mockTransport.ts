import {
  bytesToHex,
  chunkPayloadFrames,
  computeCrc16,
  DEFAULT_PROTOCOL_MAPPING,
} from './protocol';
import type {
  DeviceInfo,
  GattServiceInfo,
  PacketLogEntry,
  ProtocolMapping,
  UploadProgress,
  WatchTransport,
} from './types';

export interface MockTransportCallbacks {
  onLog: (entry: PacketLogEntry) => void;
  onBuzz?: () => void;
  onNotification?: (title: string, body: string, app: string) => void;
  onSlotActivated?: (slotId: number) => void;
}

function makeLog(
  direction: PacketLogEntry['direction'],
  channel: string,
  summary: string,
  hex?: string
): PacketLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toLocaleTimeString(),
    direction,
    channel,
    summary,
    hex,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MockReflexTransport implements WatchTransport {
  readonly mode = 'mock' as const;
  private connected = false;
  private callbacks: MockTransportCallbacks;

  constructor(callbacks: MockTransportCallbacks) {
    this.callbacks = callbacks;
  }

  async connect(): Promise<DeviceInfo> {
    this.callbacks.onLog(
      makeLog('INFO', 'BLE-SIM', 'Scanning for Fastrack Reflex 3.0 simulator…')
    );
    await delay(350);
    this.connected = true;

    const info: DeviceInfo = {
      id: 'FA-30-SIM-9C4A',
      name: 'Fastrack Reflex 3.0 (Sim)',
      model: 'FT-REFLEX-3.0',
      firmwareVersion: 'v3.0.14-sim',
      hardwareRevision: 'REV-B-TFT80x160',
      batteryLevel: 84,
      mtu: 244,
      mode: 'mock',
    };

    this.callbacks.onLog(
      makeLog('RX', 'GAP', `Connected to ${info.name} (${info.id}), MTU=${info.mtu}`)
    );
    return info;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.callbacks.onLog(makeLog('INFO', 'GAP', 'Disconnected from simulator.'));
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('Mock Reflex 3.0 band is not connected.');
    }
  }

  async discoverServices(): Promise<GattServiceInfo[]> {
    this.assertConnected();
    const services: GattServiceInfo[] = [
      {
        uuid: '0000180a-0000-1000-8000-00805f9b34fb',
        isPrimary: true,
        characteristics: [
          {
            uuid: '00002a24-0000-1000-8000-00805f9b34fb',
            properties: ['read'],
            lastValueHex: '46 54 2D 52 45 46 4C 45 58 2D 33 2E 30',
          },
          {
            uuid: '00002a26-0000-1000-8000-00805f9b34fb',
            properties: ['read'],
            lastValueHex: '76 33 2E 30 2E 31 34',
          },
        ],
      },
      {
        uuid: '0000180f-0000-1000-8000-00805f9b34fb',
        isPrimary: true,
        characteristics: [
          {
            uuid: '00002a19-0000-1000-8000-00805f9b34fb',
            properties: ['read', 'notify'],
            lastValueHex: '54',
          },
        ],
      },
      {
        uuid: DEFAULT_PROTOCOL_MAPPING.serviceUuid,
        isPrimary: true,
        characteristics: [
          {
            uuid: DEFAULT_PROTOCOL_MAPPING.writeCharacteristicUuid,
            properties: ['write', 'writeWithoutResponse'],
          },
          {
            uuid: DEFAULT_PROTOCOL_MAPPING.notifyCharacteristicUuid,
            properties: ['notify'],
          },
        ],
      },
    ];
    this.callbacks.onLog(
      makeLog('INFO', 'GATT', `Discovered ${services.length} simulated GATT services.`)
    );
    return services;
  }

  async syncTime(date: Date): Promise<void> {
    this.assertConnected();
    const payload = new Uint8Array([
      0xaa,
      0x10,
      date.getFullYear() - 2000,
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ]);
    this.callbacks.onLog(
      makeLog(
        'TX',
        'TIME_SYNC',
        `Syncing ${date.toLocaleTimeString()}`,
        bytesToHex(payload)
      )
    );
    await delay(140);
    this.callbacks.onLog(
      makeLog('RX', 'TIME_SYNC', 'ACK 0x00 (RTC updated on simulated band)', 'AA 10 00')
    );
  }

  async findBand(): Promise<void> {
    this.assertConnected();
    const payload = new Uint8Array([0xaa, 0x21, 0x03, 0x64]);
    this.callbacks.onLog(
      makeLog('TX', 'ALERT', 'Triggering Find Band vibration (3 pulses)', bytesToHex(payload))
    );
    this.callbacks.onBuzz?.();
    await delay(120);
    this.callbacks.onLog(makeLog('RX', 'ALERT', 'ACK vibration executed', 'AA 21 00'));
  }

  async pushNotification(title: string, body: string, app: string): Promise<void> {
    this.assertConnected();
    const encoder = new TextEncoder();
    const msgBytes = encoder.encode(`${app}:${title}|${body}`.slice(0, 64));
    this.callbacks.onLog(
      makeLog(
        'TX',
        'NOTIFY',
        `Pushing ${app} alert "${title}"`,
        bytesToHex(msgBytes)
      )
    );
    this.callbacks.onNotification?.(title, body, app);
    await delay(100);
    this.callbacks.onLog(makeLog('RX', 'NOTIFY', 'ACK alert rendered on band', 'AA 31 00'));
  }

  async uploadWatchface(
    packageBytes: Uint8Array,
    slotId: number,
    mapping: ProtocolMapping,
    onProgress: (progress: UploadProgress) => void
  ): Promise<{ crc16: number; verified: boolean }> {
    this.assertConnected();
    const frames = chunkPayloadFrames(packageBytes, mapping.mtuPayloadSize, 0x42);
    const payloadSlice = packageBytes.subarray(20);
    const crc16 = computeCrc16(payloadSlice);

    this.callbacks.onLog(
      makeLog(
        'TX',
        'WF_START',
        `Starting watchface upload to Slot #${slotId + 1} (${packageBytes.length} bytes, ${frames.length} chunks, MTU=${mapping.mtuPayloadSize})`,
        bytesToHex(packageBytes.subarray(0, 20))
      )
    );

    const stepEvery = Math.max(1, Math.floor(frames.length / 24));
    let sentBytes = 0;

    for (let i = 0; i < frames.length; i += 1) {
      sentBytes += frames[i].length;
      if (i % stepEvery === 0 || i === frames.length - 1) {
        const percent = Math.round(((i + 1) / frames.length) * 100);
        onProgress({
          percent,
          sentBytes: Math.min(sentBytes, packageBytes.length),
          totalBytes: packageBytes.length,
          chunkIndex: i + 1,
          totalChunks: frames.length,
          stage:
            i === frames.length - 1
              ? 'Verifying CRC-16 checksum…'
              : `Streaming RGB565 chunk ${i + 1}/${frames.length}`,
        });
        await delay(18);
      }
    }

    this.callbacks.onLog(
      makeLog(
        'RX',
        'WF_COMMIT',
        `CRC-16 verified (0x${crc16.toString(16).toUpperCase().padStart(4, '0')}). Booting Slot #${slotId + 1}.`,
        'AA 42 00'
      )
    );
    this.callbacks.onSlotActivated?.(slotId);

    return { crc16, verified: true };
  }

  async activateSlot(slotId: number): Promise<void> {
    this.assertConnected();
    const payload = new Uint8Array([0xaa, 0x43, slotId & 0xff]);
    this.callbacks.onLog(
      makeLog('TX', 'WF_BOOT', `Switching active band face to Slot #${slotId + 1}`, bytesToHex(payload))
    );
    await delay(120);
    this.callbacks.onSlotActivated?.(slotId);
    this.callbacks.onLog(makeLog('RX', 'WF_BOOT', `Slot #${slotId + 1} active`, 'AA 43 00'));
  }

  async sendRawPacket(
    serviceUuid: string,
    characteristicUuid: string,
    payload: Uint8Array
  ): Promise<void> {
    this.assertConnected();
    this.callbacks.onLog(
      makeLog(
        'TX',
        `${serviceUuid.slice(4, 8)}:${characteristicUuid.slice(4, 8)}`,
        `Raw write (${payload.length}B)`,
        bytesToHex(payload, 32)
      )
    );
    await delay(80);
    this.callbacks.onLog(makeLog('RX', 'RAW_ACK', 'Simulator echoed raw packet ACK', '00'));
  }
}

