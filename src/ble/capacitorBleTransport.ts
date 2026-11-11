import { BleClient, type BleService } from '@capacitor-community/bluetooth-le';
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

interface CapacitorBleCallbacks {
  onLog: (entry: PacketLogEntry) => void;
  onDisconnected?: () => void;
}

const BATTERY_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL_UUID = '00002a19-0000-1000-8000-00805f9b34fb';
const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
const MODEL_NUMBER_UUID = '00002a24-0000-1000-8000-00805f9b34fb';
const FIRMWARE_REV_UUID = '00002a26-0000-1000-8000-00805f9b34fb';

function toDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export class CapacitorBleTransport implements WatchTransport {
  readonly mode = 'web-bluetooth' as const;
  private deviceId: string | null = null;
  private cachedServices: BleService[] = [];
  private extraServiceUuids: string[];
  private callbacks: CapacitorBleCallbacks;

  constructor(callbacks: CapacitorBleCallbacks, extraServiceUuids: string[] = []) {
    this.callbacks = callbacks;
    this.extraServiceUuids = extraServiceUuids;
  }

  setExtraServiceUuids(uuids: string[]): void {
    this.extraServiceUuids = uuids;
  }

  private assertDeviceId(): string {
    if (!this.deviceId) {
      throw new Error('No active Android BLE GATT connection.');
    }
    return this.deviceId;
  }

  async connect(): Promise<DeviceInfo> {
    await BleClient.initialize();

    const enabled = await BleClient.isEnabled();
    if (!enabled) {
      try {
        await BleClient.requestEnable();
      } catch {
        throw new Error('Please turn on Bluetooth on your Android phone and try again.');
      }
    }

    const optionalServices = Array.from(
      new Set([
        ...COMMON_BLE_SERVICE_UUIDS,
        ...this.extraServiceUuids.filter(Boolean).map(normalizeBleUuid),
      ])
    );

    this.callbacks.onLog(
      makePacketLog('INFO', 'ANDROID-BLE', 'Scanning for nearby Bluetooth LE devices…')
    );

    const device = await BleClient.requestDevice({ optionalServices });
    await BleClient.connect(device.deviceId, () => {
      this.deviceId = null;
      this.cachedServices = [];
      this.callbacks.onLog(
        makePacketLog('WARN', 'ANDROID-BLE', 'BLE peripheral disconnected.')
      );
      this.callbacks.onDisconnected?.();
    });

    this.deviceId = device.deviceId;
    this.cachedServices = await BleClient.getServices(device.deviceId);

    let mtu = 20;
    try {
      const negotiated = await BleClient.getMtu(device.deviceId);
      if (negotiated > 3) mtu = Math.max(20, negotiated - 3);
    } catch {
      // Fallback to default ATT payload size
    }

    let batteryLevel = 0;
    let model = 'Unknown BLE Device';
    let firmwareVersion = 'Unknown';

    const hasService = (uuid: string) =>
      this.cachedServices.some((s) => normalizeBleUuid(s.uuid) === uuid);

    if (hasService(BATTERY_SERVICE_UUID)) {
      try {
        const dv = await BleClient.read(
          device.deviceId,
          BATTERY_SERVICE_UUID,
          BATTERY_LEVEL_UUID
        );
        batteryLevel = dv.getUint8(0);
      } catch {
        // Ignore protected battery characteristic
      }
    }

    if (hasService(DEVICE_INFO_SERVICE_UUID)) {
      const decoder = new TextDecoder();
      try {
        const modelDv = await BleClient.read(
          device.deviceId,
          DEVICE_INFO_SERVICE_UUID,
          MODEL_NUMBER_UUID
        );
        model = decoder.decode(modelDv);
      } catch {
        // Ignore missing model string
      }
      try {
        const fwDv = await BleClient.read(
          device.deviceId,
          DEVICE_INFO_SERVICE_UUID,
          FIRMWARE_REV_UUID
        );
        firmwareVersion = decoder.decode(fwDv);
      } catch {
        // Ignore missing firmware revision
      }
    }

    const info: DeviceInfo = {
      id: device.deviceId,
      name: device.name || 'Unnamed BLE Band',
      model,
      firmwareVersion,
      hardwareRevision: 'Android GATT',
      batteryLevel,
      mtu,
      mode: 'web-bluetooth',
    };

    this.callbacks.onLog(
      makePacketLog('RX', 'ANDROID-BLE', `Connected to ${info.name} (${info.id})`)
    );
    return info;
  }

  async disconnect(): Promise<void> {
    if (this.deviceId) {
      const id = this.deviceId;
      this.deviceId = null;
      this.cachedServices = [];
      await BleClient.disconnect(id);
    }
  }

  async discoverServices(): Promise<GattServiceInfo[]> {
    const deviceId = this.assertDeviceId();
    const rawServices = await BleClient.getServices(deviceId);
    this.cachedServices = rawServices;
    const result: GattServiceInfo[] = [];

    for (const service of rawServices) {
      const charInfos: GattCharacteristicInfo[] = [];

      for (const char of service.characteristics) {
        let lastValueHex: string | undefined;
        if (char.properties.read) {
          try {
            const dv = await BleClient.read(deviceId, service.uuid, char.uuid);
            const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
            lastValueHex = bytesToHex(bytes, 24);
          } catch {
            // Some characteristics require bonding
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
        isPrimary: true,
        characteristics: charInfos,
      });
    }

    this.callbacks.onLog(
      makePacketLog(
        'INFO',
        'GATT',
        `Discovered ${result.length} primary GATT services on Android.`
      )
    );
    return result;
  }

  async syncTime(): Promise<void> {
    throw new Error(
      'Fastrack Reflex 3.0 time-sync opcode is unmapped on raw BLE. Use the BLE Inspector once you map your band UUIDs.'
    );
  }

  async findBand(): Promise<void> {
    throw new Error(
      'Fastrack Reflex 3.0 alert opcode is unmapped on raw BLE. Switch to Simulator mode or send a mapped packet in BLE Inspector.'
    );
  }

  async pushNotification(): Promise<void> {
    throw new Error('Fastrack Reflex 3.0 notification opcode is unmapped on raw BLE.');
  }

  async activateSlot(): Promise<void> {
    throw new Error('Fastrack Reflex 3.0 slot activation opcode is unmapped on raw BLE.');
  }

  private isWriteWithoutResponse(serviceUuid: string, charUuid: string): boolean {
    const svcNorm = normalizeBleUuid(serviceUuid);
    const charNorm = normalizeBleUuid(charUuid);
    const service = this.cachedServices.find((s) => normalizeBleUuid(s.uuid) === svcNorm);
    const char = service?.characteristics.find(
      (c) => normalizeBleUuid(c.uuid) === charNorm
    );
    return Boolean(char?.properties.writeWithoutResponse && !char?.properties.write);
  }

  async uploadWatchface(
    packageBytes: Uint8Array,
    _slotId: number,
    mapping: ProtocolMapping,
    onProgress: (progress: UploadProgress) => void
  ): Promise<{ crc16: number; verified: boolean }> {
    const deviceId = this.assertDeviceId();
    const targetSvc = normalizeBleUuid(mapping.serviceUuid);
    const targetChar = normalizeBleUuid(mapping.writeCharacteristicUuid);

    if (this.cachedServices.length === 0) {
      this.cachedServices = await BleClient.getServices(deviceId);
    }

    const matchedSvc = this.cachedServices.find(
      (s) => normalizeBleUuid(s.uuid) === targetSvc
    );
    if (!matchedSvc) {
      const uuids = this.cachedServices.map((s) => s.uuid).join(', ') || 'none';
      throw new Error(
        `Target service ${mapping.serviceUuid} was not found on this watch (discovered services: ${uuids}). Open BLE Inspector to pick a discovered writable UUID. Note: physical Fastrack Reflex 3.0 flashing also requires the band's proprietary packet format.`
      );
    }

    const noResponse = this.isWriteWithoutResponse(targetSvc, targetChar);
    const frames = chunkPayloadFrames(packageBytes, mapping.mtuPayloadSize, 0x42);
    const crc16 = computeCrc16(packageBytes.subarray(20));

    this.callbacks.onLog(
      makePacketLog(
        'TX',
        'ANDROID-BLE-WF',
        `Streaming ${frames.length} experimental frames to ${mapping.writeCharacteristicUuid}`,
        bytesToHex(packageBytes.subarray(0, 20))
      )
    );

    let sentBytes = 0;
    for (let i = 0; i < frames.length; i += 1) {
      const dv = toDataView(frames[i]);
      if (noResponse) {
        await BleClient.writeWithoutResponse(deviceId, matchedSvc.uuid, targetChar, dv);
      } else {
        await BleClient.write(deviceId, matchedSvc.uuid, targetChar, dv);
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
    const deviceId = this.assertDeviceId();
    const svc = normalizeBleUuid(serviceUuid);
    const ch = normalizeBleUuid(characteristicUuid);
    const dv = toDataView(payload);

    if (this.isWriteWithoutResponse(svc, ch)) {
      await BleClient.writeWithoutResponse(deviceId, svc, ch, dv);
    } else {
      await BleClient.write(deviceId, svc, ch, dv);
    }

    this.callbacks.onLog(
      makePacketLog(
        'TX',
        `${svc.slice(0, 8)}`,
        `Wrote ${payload.length}B to ${characteristicUuid}`,
        bytesToHex(payload, 32)
      )
    );
  }
}
