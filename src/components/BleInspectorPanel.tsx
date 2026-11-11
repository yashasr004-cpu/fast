import { useState } from 'react';
import {
  AlertTriangle,
  Radio,
  Search,
  Send,
  Settings2,
  Terminal,
  Trash2,
} from 'lucide-react';
import { hexStringToBytes } from '../ble/protocol';
import type {
  ConnectionState,
  DeviceInfo,
  GattServiceInfo,
  PacketLogEntry,
  ProtocolMapping,
  TransportMode,
} from '../ble/types';
import { isWebBluetoothSupported } from '../ble/webBluetoothTransport';

interface BleInspectorPanelProps {
  transportMode: TransportMode;
  connectionState: ConnectionState;
  deviceInfo: DeviceInfo | null;
  services: GattServiceInfo[];
  mapping: ProtocolMapping;
  extraServiceUuidsInput: string;
  logs: PacketLogEntry[];
  onChangeMode: (mode: TransportMode) => void;
  onChangeMapping: (next: ProtocolMapping) => void;
  onChangeExtraUuids: (value: string) => void;
  onDiscoverServices: () => void;
  onSendRawHex: (serviceUuid: string, charUuid: string, bytes: Uint8Array) => void;
  onClearLogs: () => void;
}

export function BleInspectorPanel({
  transportMode,
  connectionState,
  deviceInfo,
  services,
  mapping,
  extraServiceUuidsInput,
  logs,
  onChangeMode,
  onChangeMapping,
  onChangeExtraUuids,
  onDiscoverServices,
  onSendRawHex,
  onClearLogs,
}: BleInspectorPanelProps) {
  const [rawHex, setRawHex] = useState('AA 10 1A 0B 0B 11 2B 00');
  const [rawError, setRawError] = useState<string | null>(null);
  const webBleCheck = isWebBluetoothSupported();
  const isConnected = connectionState === 'connected';

  const handleSendRaw = () => {
    try {
      setRawError(null);
      const bytes = hexStringToBytes(rawHex);
      onSendRawHex(mapping.serviceUuid, mapping.writeCharacteristicUuid, bytes);
    } catch (err) {
      setRawError(err instanceof Error ? err.message : 'Invalid hex input.');
    }
  };

  return (
    <div className="panel-stack">
      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Radio size={16} />
            <span>Bluetooth Transport Mode</span>
          </div>
          <span className="badge">
            {transportMode === 'mock'
              ? 'Simulator'
              : webBleCheck.native
                ? 'Android BLE'
                : 'Web Bluetooth'}
          </span>
        </div>

        <div className="segmented-grid">
          <button
            type="button"
            className={`seg-btn ${transportMode === 'mock' ? 'active' : ''}`}
            onClick={() => onChangeMode('mock')}
          >
            Reflex 3.0 Simulator (Mock BLE)
          </button>
          <button
            type="button"
            className={`seg-btn ${transportMode === 'web-bluetooth' ? 'active' : ''}`}
            onClick={() => onChangeMode('web-bluetooth')}
          >
            {webBleCheck.native
              ? 'Real Android BLE (Native Bluetooth)'
              : 'Real Web Bluetooth (Chrome / Edge)'}
          </button>
        </div>

        <div className="notice-banner">
          <AlertTriangle size={16} />
          <div>
            <strong>Hardware Protocol Note:</strong> Fastrack Reflex 3.0 uses a
            proprietary, undocumented BLE GATT protocol inside the{' '}
            <em>Fastrack Reflex World</em> app. Use <strong>Simulator</strong> mode to
            test flows safely, or switch to{' '}
            <strong>{webBleCheck.native ? 'Real Android BLE' : 'Real Web Bluetooth'}</strong>{' '}
            to scan your band&apos;s GATT UUIDs and test mapped characteristics once
            captured from a Bluetooth HCI snoop log.
          </div>
        </div>

        {transportMode === 'web-bluetooth' && !webBleCheck.supported && (
          <div className="error-banner">{webBleCheck.reason}</div>
        )}

        {transportMode === 'web-bluetooth' && (
          <label className="field">
            <span>Optional Extra Service UUIDs (comma-separated, pre-connect)</span>
            <input
              type="text"
              className="input"
              value={extraServiceUuidsInput}
              onChange={(e) => onChangeExtraUuids(e.target.value)}
              placeholder="e.g. 0000feea-0000-1000-8000-00805f9b34fb"
            />
          </label>
        )}

        {deviceInfo && (
          <div className="device-meta-grid">
            <div>
              <span className="meta-k">Device:</span> {deviceInfo.name}
            </div>
            <div>
              <span className="meta-k">Model:</span> {deviceInfo.model}
            </div>
            <div>
              <span className="meta-k">Firmware:</span> {deviceInfo.firmwareVersion}
            </div>
            <div>
              <span className="meta-k">MTU:</span> {deviceInfo.mtu} bytes
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Settings2 size={16} />
            <span>Pluggable Protocol Mapping</span>
          </div>
          <button
            type="button"
            className="btn btn-xs btn-secondary"
            disabled={!isConnected}
            onClick={onDiscoverServices}
          >
            <Search size={13} />
            <span>Inspect GATT</span>
          </button>
        </div>

        <div className="controls-col">
          <label className="field">
            <span>Target Service UUID</span>
            <input
              type="text"
              className="input mono"
              value={mapping.serviceUuid}
              onChange={(e) =>
                onChangeMapping({ ...mapping, serviceUuid: e.target.value })
              }
            />
          </label>
          <label className="field">
            <span>Write Characteristic UUID</span>
            <input
              type="text"
              className="input mono"
              value={mapping.writeCharacteristicUuid}
              onChange={(e) =>
                onChangeMapping({
                  ...mapping,
                  writeCharacteristicUuid: e.target.value,
                })
              }
            />
          </label>
          <div className="controls-row">
            <label className="field grow">
              <span>MTU Frame Bytes</span>
              <input
                type="number"
                min={20}
                max={512}
                className="input"
                value={mapping.mtuPayloadSize}
                onChange={(e) =>
                  onChangeMapping({
                    ...mapping,
                    mtuPayloadSize: Math.max(20, Number(e.target.value) || 20),
                  })
                }
              />
            </label>
            <label className="field grow">
              <span>RGB565 Endianness</span>
              <select
                className="input"
                value={mapping.endianness}
                onChange={(e) =>
                  onChangeMapping({
                    ...mapping,
                    endianness: e.target.value as 'little' | 'big',
                  })
                }
              >
                <option value="little">Little Endian (LE)</option>
                <option value="big">Big Endian (BE)</option>
              </select>
            </label>
          </div>
        </div>

        {services.length > 0 && (
          <div className="gatt-list">
            {services.map((svc) => (
              <div key={svc.uuid} className="gatt-service">
                <div className="gatt-svc-uuid">{svc.uuid}</div>
                {svc.characteristics.map((char) => (
                  <div key={char.uuid} className="gatt-char">
                    <div className="gatt-char-main">
                      <code>{char.uuid}</code>
                      <span className="gatt-props">
                        [{char.properties.join(', ')}]
                      </span>
                    </div>
                    {(char.properties.includes('write') ||
                      char.properties.includes('writeWithoutResponse')) && (
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={() =>
                          onChangeMapping({
                            ...mapping,
                            serviceUuid: svc.uuid,
                            writeCharacteristicUuid: char.uuid,
                          })
                        }
                      >
                        Use Write UUID
                      </button>
                    )}
                    {char.lastValueHex && (
                      <div className="gatt-val">HEX: {char.lastValueHex}</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Terminal size={16} />
            <span>Packet Console &amp; Raw Hex Write</span>
          </div>
          <button type="button" className="btn btn-xs btn-ghost" onClick={onClearLogs}>
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>

        <div className="name-save-row">
          <input
            type="text"
            className="input mono"
            value={rawHex}
            onChange={(e) => setRawHex(e.target.value)}
            placeholder="Hex bytes, e.g. AA 10 1A 0B 0B"
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!isConnected}
            onClick={handleSendRaw}
          >
            <Send size={14} />
            <span>Send Hex</span>
          </button>
        </div>
        {rawError && <div className="error-text">{rawError}</div>}

        <div className="packet-log">
          {logs.length === 0 ? (
            <div className="empty-log">
              Connect to the Simulator or a Web Bluetooth device to inspect BLE frames.
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className={`log-line dir-${entry.direction.toLowerCase()}`}>
                <span className="log-time">{entry.timestamp}</span>
                <span className="log-dir">{entry.direction}</span>
                <span className="log-ch">{entry.channel}</span>
                <span className="log-msg">{entry.summary}</span>
                {entry.hex && <code className="log-hex">{entry.hex}</code>}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

