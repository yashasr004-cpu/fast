export type TransportMode = 'mock' | 'web-bluetooth';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceInfo {
  id: string;
  name: string;
  model: string;
  firmwareVersion: string;
  hardwareRevision: string;
  batteryLevel: number;
  mtu: number;
  mode: TransportMode;
}

export interface GattCharacteristicInfo {
  uuid: string;
  properties: string[];
  lastValueHex?: string;
}

export interface GattServiceInfo {
  uuid: string;
  isPrimary: boolean;
  characteristics: GattCharacteristicInfo[];
}

export interface ProtocolMapping {
  serviceUuid: string;
  writeCharacteristicUuid: string;
  notifyCharacteristicUuid: string;
  mtuPayloadSize: number;
  endianness: 'little' | 'big';
}

export interface PacketLogEntry {
  id: string;
  timestamp: string;
  direction: 'TX' | 'RX' | 'INFO' | 'WARN';
  channel: string;
  summary: string;
  hex?: string;
}

export interface UploadProgress {
  percent: number;
  sentBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
  stage: string;
}

export interface WatchTransport {
  readonly mode: TransportMode;
  connect(): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  discoverServices(): Promise<GattServiceInfo[]>;
  syncTime(date: Date): Promise<void>;
  findBand(): Promise<void>;
  pushNotification(title: string, body: string, app: string): Promise<void>;
  uploadWatchface(
    packageBytes: Uint8Array,
    slotId: number,
    mapping: ProtocolMapping,
    onProgress: (progress: UploadProgress) => void
  ): Promise<{ crc16: number; verified: boolean }>;
  activateSlot(slotId: number): Promise<void>;
  sendRawPacket(
    serviceUuid: string,
    characteristicUuid: string,
    payload: Uint8Array
  ): Promise<void>;
}

