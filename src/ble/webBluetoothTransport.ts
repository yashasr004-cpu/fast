import { Capacitor } from '@capacitor/core';
import {
  bytesToHex,
  chunkPayloadFrames,
  computeCrc16,
} from './protocol';
import type {
  DeviceInfo,
  GattCharacteristicInfo,
  GattServiceInfo,
  PacketLogEntry,
  ProtocolMapping,
  UploadProgress,
  WatchTransport,
} from './types';
import {
  COMMON_BLE_SERVICE_UUIDS,
  formatGattProperties,
  makePacketLog,
  normalizeBleUuid,
} from './utils';

interface WebBluetoothCallbacks {
  onLog: (entry: PacketLogEntry) => void;
  onDisconnected?: () => void;
}

export function isNativeBlePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isWebBluetoothSupported(): {
  supported: boolean;
  native?: boolean;
  reason?: string;
} {
  if (isNativeBlePlatform()) {
    return { supported: true, native: true };
  }
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'No browser environment detected.' };
  }
  if (!window.isSecureContext) {
    return {
      supported: false,
      reason: 'Web Bluetooth requires HTTPS or http://localhost.',
    };
  }
  if (!('bluetooth' in navigator)) {
    return {
      supported: false,
      reason: 'Use Chrome or Edge (desktop or Android) with Web Bluetooth enabled.',
    };
  }
  return { supported: true };
}

export class WebBluetoothTransport implements WatchTransport {
  readonly mode = 'web-bluetooth' as const;
  private server: BluetoothRemoteGATTServer | null = null;
  private callbacks: WebBluetoothCallbacks;
  private activeOptionalServices: string[] = [...COMMON_BLE_SERVICE_UUIDS];

  constructor(callbacks: WebBluetoothCallbacks, extraServiceUuids: string[] = []) {
    this.callbacks = callbacks;
    if (extraServiceUuids.length > 0) {
      this.activeOptionalServices = Array.from(
        new Set([
          ...COMMON_BLE_SERVICE_UUIDS,
          ...extraServiceUuids.filter(Boolean).map(normalizeBleUuid),
        ])
      );
    }
  }

  setExtraServiceUuids(uuids: string[]): void {
    this.activeOptionalServices = Array.from(
      new Set([
        ...COMMON_BLE_SERVICE_UUIDS,
        ...uuids.filter(Boolean).map(normalizeBleUuid),
      ])
    );
  }

  async connect(): Promise<DeviceInfo> {
    const check = isWebBluetoothSupported();
    if (!check.supported) {
      throw new Error(check.reason ?? 'Web Bluetooth is unavailable.');
    }

    this.callbacks.onLog(
      makePacketLog('INFO', 'WEB-BLE', 'Opening browser Bluetooth device picker…')
    );

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: this.activeOptionalServices,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/globally disabled/i.test(msg)) {
        throw new Error(
          'Web Bluetooth is disabled in this browser (e.g. Brave blocks it by default). Enable brave://flags/#enable-web-bluetooth and relaunch, or open http://localhost:8017 in Chrome/Edge — or use Simulator mode.'
        );
      }
      throw err;
    }

    device.addEventListener('gattserverdisconnected', () => {
      this.server = null;
      this.callbacks.onLog(
        makePacketLog('WARN', 'WEB-BLE', `Device ${device.name ?? device.id} disconnected.`)
      );
      this.callbacks.onDisconnected?.();
    });

    if (!device.gatt) {
      throw new Error('Selected device does not expose a GATT server.');
    }

    const server = await device.gatt.connect();
    this.server = server;

    let batteryLevel = 0;
    let model = 'Unknown BLE Device';
    let firmwareVersion = 'Unknown';

    try {
      const batteryService = await server.getPrimaryService('battery_service');
      const batteryChar = await batteryService.getCharacteristic('battery_level');
      const val = await batteryChar.readValue();
      batteryLevel = val.getUint8(0);
    } catch {
      // Optional service may not be exposed
    }

    try {
      const infoService = await server.getPrimaryService('device_information');
      const decoder = new TextDecoder();
      try {
        const modelChar = await infoService.getCharacteristic('model_number_string');
        model = decoder.decode(await modelChar.readValue());
      } catch {
        // Ignore missing characteristic
      }
      try {
        const fwChar = await infoService.getCharacteristic('firmware_revision_string');
        firmwareVersion = decoder.decode(await fwChar.readValue());
      } catch {
        // Ignore missing characteristic
      }
    } catch {
      // Optional service may not be exposed
    }

    const info: DeviceInfo = {
      id: device.id,
      name: device.name || 'Unnamed BLE Band',
      model,
      firmwareVersion,
      hardwareRevision: 'GATT',
      batteryLevel,
      mtu: 20,
      mode: 'web-bluetooth',
    };

    this.callbacks.onLog(
      makePacketLog('RX', 'WEB-BLE', `Connected to ${info.name} (${info.id})`)
    );
    return info;
  }

  async disconnect(): Promise<void> {
    if (this.server?.connected) {
      this.server.disconnect();
    }
    this.server = null;
  }

  private assertServer(): BluetoothRemoteGATTServer {
    if (!this.server || !this.server.connected) {
      throw new Error('No active Web Bluetooth GATT connection.');
    }
    return this.server;
  }

  async discoverServices(): Promise<GattServiceInfo[]> {
    const server = this.assertServer();
    const services = await server.getPrimaryServices();
    const result: GattServiceInfo[] = [];

    for (const service of services) {
      const chars = await service.getCharacteristics();
      const charInfos: GattCharacteristicInfo[] = [];

      for (const char of chars) {
        let lastValueHex: string | undefined;
        if (char.properties.read) {
          try {
            const dv = await char.readValue();
            const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
            lastValueHex = bytesToHex(bytes, 24);
          } catch {
            // Some characteristics restrict reads without bonding
          }
        }
        charInfos.push({
          uuid: char.uuid,
          properties: formatGattProperties(char.properties),
          lastValueHex,
        });
      }

      result.push({
        uuid: service.uuid,
        isPrimary: service.isPrimary,
        characteristics: charInfos,
      });
    }

    this.callbacks.onLog(
      makePacketLog('INFO', 'GATT', `Discovered ${result.length} accessible primary services.`)
    );
    return result;
  }

  async syncTime(): Promise<void> {
    throw new Error(
      'Fastrack Reflex 3.0 time-sync opcode is unmapped on raw Web Bluetooth. Use the GATT Inspector / Raw Packet Console once you map your band UUIDs.'
    );
  }

  async findBand(): Promise<void> {
    throw new Error(
      'Fastrack Reflex 3.0 alert opcode is unmapped on raw Web Bluetooth. Switch to Simulator mode or send a mapped packet in the GATT Inspector.'
    );
  }

  async pushNotification(): Promise<void> {
    throw new Error(
      'Fastrack Reflex 3.0 notification opcode is unmapped on raw Web Bluetooth.'
    );
  }

  async activateSlot(): Promise<void> {
    throw new Error(
      'Fastrack Reflex 3.0 slot activation opcode is unmapped on raw Web Bluetooth.'
    );
  }

  async uploadWatchface(
    packageBytes: Uint8Array,
    _slotId: number,
    mapping: ProtocolMapping,
    onProgress: (progress: UploadProgress) => void
  ): Promise<{ crc16: number; verified: boolean }> {
    const server = this.assertServer();
    let service: BluetoothRemoteGATTService;
    try {
      service = await server.getPrimaryService(mapping.serviceUuid);
    } catch {
      const available = await server.getPrimaryServices();
      const uuids = available.map((s) => s.uuid).join(', ') || 'none';
      throw new Error(
        `Target service ${mapping.serviceUuid} was not found on this watch (discovered services: ${uuids}). Open the BLE Inspector tab to pick a discovered writable UUID or add your band's custom service UUID before pairing. Note: physical Fastrack Reflex 3.0 flashing also requires the band's proprietary packet format.`
      );
    }
    const writeChar = await service.getCharacteristic(mapping.writeCharacteristicUuid);
    const frames = chunkPayloadFrames(packageBytes, mapping.mtuPayloadSize, 0x42);
    const crc16 = computeCrc16(packageBytes.subarray(20));

    this.callbacks.onLog(
      makePacketLog(
        'TX',
        'WEB-BLE-WF',
        `Streaming ${frames.length} experimental frames to ${mapping.writeCharacteristicUuid}`,
        bytesToHex(packageBytes.subarray(0, 20))
      )
    );

    let sentBytes = 0;
    for (let i = 0; i < frames.length; i += 1) {
      const frameCopy = new Uint8Array(frames[i]);
      if (writeChar.properties.writeWithoutResponse) {
        await writeChar.writeValueWithoutResponse(frameCopy);
      } else {
        await writeChar.writeValueWithResponse(frameCopy);
      }
      sentBytes += frames[i].length;
      if (i % 10 === 0 || i === frames.length - 1) {
        onProgress({
          percent: Math.round(((i + 1) / frames.length) * 100),
          sentBytes: Math.min(sentBytes, packageBytes.length),
          totalBytes: packageBytes.length,
          chunkIndex: i + 1,
          totalChunks: frames.length,
          stage: `Sent frame ${i + 1}/${frames.length}`,
        });
      }
    }

    return { crc16, verified: false };
  }

  async sendRawPacket(
    serviceUuid: string,
    characteristicUuid: string,
    payload: Uint8Array
  ): Promise<void> {
    const server = this.assertServer();
    const service = await server.getPrimaryService(serviceUuid);
    const characteristic = await service.getCharacteristic(characteristicUuid);
    const copy = new Uint8Array(payload);

    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(copy);
    } else {
      await characteristic.writeValueWithResponse(copy);
    }

    this.callbacks.onLog(
      makePacketLog(
        'TX',
        `${serviceUuid.slice(0, 8)}`,
        `Wrote ${payload.length}B to ${characteristicUuid}`,
        bytesToHex(payload, 32)
      )
    );
  }
}

