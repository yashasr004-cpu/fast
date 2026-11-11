import type { PacketLogEntry } from './types';

export const COMMON_BLE_SERVICE_UUIDS: readonly string[] = [
  '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
  '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
  '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
  '0000180d-0000-1000-8000-00805f9b34fb', // Heart Rate
  '00001805-0000-1000-8000-00805f9b34fb', // Current Time Service
  '00001811-0000-1000-8000-00805f9b34fb', // Alert Notification Service
  '00001802-0000-1000-8000-00805f9b34fb', // Immediate Alert
  '00001803-0000-1000-8000-00805f9b34fb', // Link Loss
  '00001530-1212-efde-1523-785feabcd123', // Legacy Nordic DFU
  '0000fe59-0000-1000-8000-00805f9b34fb', // Nordic Secure DFU
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (NUS)
  '00000af0-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000fd00-0000-1000-8000-00805f9b34fb',
  '0000fee0-0000-1000-8000-00805f9b34fb',
  '0000fee1-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000fee8-0000-1000-8000-00805f9b34fb',
  '0000fee9-0000-1000-8000-00805f9b34fb',
  '0000feea-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ff10-0000-1000-8000-00805f9b34fb',
  '0000ffa0-0000-1000-8000-00805f9b34fb',
  '0000ffb0-0000-1000-8000-00805f9b34fb',
  '0000ffc0-0000-1000-8000-00805f9b34fb',
  '0000ffd0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ffe5-0000-1000-8000-00805f9b34fb',
  '0000ffe9-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
];

export function makePacketLog(
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

export function formatGattProperties(props: {
  read?: boolean;
  write?: boolean;
  writeWithoutResponse?: boolean;
  notify?: boolean;
  indicate?: boolean;
}): string[] {
  const list: string[] = [];
  if (props.read) list.push('read');
  if (props.write) list.push('write');
  if (props.writeWithoutResponse) list.push('writeWithoutResponse');
  if (props.notify) list.push('notify');
  if (props.indicate) list.push('indicate');
  return list;
}

export function normalizeBleUuid(uuid: string): string {
  const trimmed = uuid.trim().toLowerCase();
  if (/^[0-9a-f]{4}$/.test(trimmed)) {
    return `0000${trimmed}-0000-1000-8000-00805f9b34fb`;
  }
  if (/^[0-9a-f]{8}$/.test(trimmed)) {
    return `${trimmed}-0000-1000-8000-00805f9b34fb`;
  }
  return trimmed;
}
