import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bluetooth,
  BluetoothConnected,
  Layers,
  Palette,
  Radio,
  Watch,
} from 'lucide-react';
import { MockReflexTransport } from './ble/mockTransport';
import {
  buildWatchfaceBinary,
  DEFAULT_PROTOCOL_MAPPING,
} from './ble/protocol';
import type {
  ConnectionState,
  DeviceInfo,
  GattServiceInfo,
  PacketLogEntry,
  ProtocolMapping,
  TransportMode,
  UploadProgress,
  WatchTransport,
} from './ble/types';
import { WebBluetoothTransport } from './ble/webBluetoothTransport';
import { BandFeaturesPanel } from './components/BandFeaturesPanel';
import { BleInspectorPanel } from './components/BleInspectorPanel';
import { ReflexBandPreview } from './components/ReflexBandPreview';
import { WatchfaceEditor } from './components/WatchfaceEditor';
import { DEFAULT_TELEMETRY, PRESET_WATCHFACES } from './studio/presets';
import type {
  WatchfaceConfig,
  WatchNotification,
  WatchSlot,
  WatchTelemetry,
} from './types/watchface';

type ActiveTab = 'studio' | 'band' | 'ble';

const STORAGE_FACES_KEY = 'reflex3_saved_faces_v1';

function loadSavedFaces(): WatchfaceConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_FACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickWritableMapping(
  discovered: GattServiceInfo[],
  prev: ProtocolMapping
): ProtocolMapping {
  const standardServicePrefixes = ['00001800', '00001801', '0000180a', '0000180f'];
  for (const svc of discovered) {
    if (standardServicePrefixes.some((p) => svc.uuid.startsWith(p))) continue;
    const writable = svc.characteristics.find(
      (c) =>
        c.properties.includes('write') ||
        c.properties.includes('writeWithoutResponse')
    );
    if (writable) {
      const notifiable = svc.characteristics.find((c) =>
        c.properties.includes('notify')
      );
      return {
        ...prev,
        serviceUuid: svc.uuid,
        writeCharacteristicUuid: writable.uuid,
        notifyCharacteristicUuid: notifiable?.uuid ?? prev.notifyCharacteristicUuid,
      };
    }
  }
  return prev;
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [transportMode, setTransportMode] = useState<TransportMode>('mock');
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [services, setServices] = useState<GattServiceInfo[]>([]);
  const [mapping, setMapping] = useState<ProtocolMapping>(DEFAULT_PROTOCOL_MAPPING);
  const [extraUuidsInput, setExtraUuidsInput] = useState('');

  const [config, setConfig] = useState<WatchfaceConfig>(PRESET_WATCHFACES[0]);
  const [savedFaces, setSavedFaces] = useState<WatchfaceConfig[]>(loadSavedFaces);
  const [telemetry, setTelemetry] = useState<WatchTelemetry>(DEFAULT_TELEMETRY);
  const [now, setNow] = useState<Date>(() => new Date());

  const [slots, setSlots] = useState<WatchSlot[]>(() =>
    PRESET_WATCHFACES.slice(0, 4).map((preset, index) => ({
      slotId: index,
      label: `Slot #${index + 1}`,
      watchfaceId: preset.id,
      watchfaceName: preset.name,
      updatedAt: 'Factory default',
    }))
  );
  const [slotConfigs, setSlotConfigs] = useState<Record<number, WatchfaceConfig>>(() => ({
    0: PRESET_WATCHFACES[0],
    1: PRESET_WATCHFACES[1],
    2: PRESET_WATCHFACES[2],
    3: PRESET_WATCHFACES[3],
  }));
  const [activeSlotId, setActiveSlotId] = useState(0);
  const [selectedTargetSlot, setSelectedTargetSlot] = useState(0);

  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [lastCrcHex, setLastCrcHex] = useState<string | null>(null);
  const [isVibrating, setIsVibrating] = useState(false);
  const [activeNotification, setActiveNotification] =
    useState<WatchNotification | null>(null);
  const [logs, setLogs] = useState<PacketLogEntry[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [captureSignal, setCaptureSignal] = useState(0);
  const pendingCaptureActionRef = useRef<((rgba: Uint8ClampedArray) => void) | null>(
    null
  );

  const appendLog = useCallback((entry: PacketLogEntry) => {
    setLogs((prev) => [entry, ...prev].slice(0, 120));
  }, []);

  const mockTransport = useMemo(
    () =>
      new MockReflexTransport({
        onLog: appendLog,
        onBuzz: () => {
          setIsVibrating(true);
          setTimeout(() => setIsVibrating(false), 1400);
        },
        onNotification: (title, body, app) => {
          const notif: WatchNotification = {
            id: String(Date.now()),
            app: app as WatchNotification['app'],
            title,
            body,
            receivedAt: new Date().toLocaleTimeString(),
          };
          setActiveNotification(notif);
          setTimeout(() => {
            setActiveNotification((curr) => (curr?.id === notif.id ? null : curr));
          }, 4500);
        },
        onSlotActivated: (slotId) => {
          setActiveSlotId(slotId);
        },
      }),
    [appendLog]
  );

  const webBleTransport = useMemo(
    () =>
      new WebBluetoothTransport({
        onLog: appendLog,
        onDisconnected: () => {
          setConnectionState('disconnected');
          setDeviceInfo(null);
        },
      }),
    [appendLog]
  );

  const activeTransport: WatchTransport =
    transportMode === 'mock' ? mockTransport : webBleTransport;

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FACES_KEY, JSON.stringify(savedFaces));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedFaces]);

  const handleConnectToggle = async () => {
    setStatusError(null);
    if (connectionState === 'connected') {
      await activeTransport.disconnect();
      setConnectionState('disconnected');
      setDeviceInfo(null);
      setServices([]);
      return;
    }

    try {
      setConnectionState('connecting');
      if (transportMode === 'web-bluetooth') {
        webBleTransport.setExtraServiceUuids(extraUuidsInput.split(','));
      }
      const info = await activeTransport.connect();
      setDeviceInfo(info);
      setConnectionState('connected');
      if (info.batteryLevel > 0) {
        setTelemetry((prev) => ({ ...prev, battery: info.batteryLevel }));
      }
      const discovered = await activeTransport.discoverServices();
      setServices(discovered);
      setMapping((prev) => pickWritableMapping(discovered, prev));
    } catch (err) {
      setConnectionState('error');
      setStatusError(err instanceof Error ? err.message : 'Bluetooth connection failed.');
    }
  };

  const handleSwitchMode = async (mode: TransportMode) => {
    if (mode === transportMode) return;
    if (connectionState === 'connected') {
      await activeTransport.disconnect();
    }
    setConnectionState('disconnected');
    setDeviceInfo(null);
    setServices([]);
    setStatusError(null);
    setTransportMode(mode);
  };

  const requestCapturedFrame = (callback: (rgba: Uint8ClampedArray) => void) => {
    pendingCaptureActionRef.current = callback;
    setCaptureSignal((n) => n + 1);
  };

  const handleFrameCaptured = (rgba: Uint8ClampedArray) => {
    const cb = pendingCaptureActionRef.current;
    pendingCaptureActionRef.current = null;
    if (cb) cb(rgba);
  };

  const handleFlashToBand = () => {
    setStatusError(null);
    requestCapturedFrame(async (rgba) => {
      try {
        const { bytes } = buildWatchfaceBinary(
          rgba,
          selectedTargetSlot,
          mapping.endianness
        );
        const result = await activeTransport.uploadWatchface(
          bytes,
          selectedTargetSlot,
          mapping,
          (progress) => setUploadProgress(progress)
        );
        const crcStr = `0x${result.crc16.toString(16).toUpperCase().padStart(4, '0')}`;
        setLastCrcHex(crcStr);
        setSlotConfigs((prev) => ({ ...prev, [selectedTargetSlot]: { ...config } }));
        setSlots((prev) =>
          prev.map((s) =>
            s.slotId === selectedTargetSlot
              ? {
                  ...s,
                  watchfaceId: config.id,
                  watchfaceName: config.name || 'Custom Face',
                  updatedAt: new Date().toLocaleTimeString(),
                }
              : s
          )
        );
        setActiveSlotId(selectedTargetSlot);
      } catch (err) {
        setStatusError(err instanceof Error ? err.message : 'Watchface flash failed.');
      } finally {
        setUploadProgress(null);
      }
    });
  };

  const handleExportBin = () => {
    requestCapturedFrame((rgba) => {
      const { bytes } = buildWatchfaceBinary(
        rgba,
        selectedTargetSlot,
        mapping.endianness
      );
      const copy = new Uint8Array(bytes);
      const safeName = (config.name || 'reflex-face')
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-');
      downloadBlob(
        new Blob([copy.buffer], { type: 'application/octet-stream' }),
        `${safeName}-80x160.bin`
      );
    });
  };

  const handleExportJson = () => {
    const safeName = (config.name || 'reflex-face')
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-');
    downloadBlob(
      new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
      `${safeName}.json`
    );
  };

  const handleSaveFace = () => {
    const trimmed = config.name.trim() || 'Custom Face';
    const customId = config.id.startsWith('preset-')
      ? `custom-${Date.now()}`
      : config.id;
    const saved: WatchfaceConfig = { ...config, id: customId, name: trimmed };
    setConfig(saved);
    setSavedFaces((prev) => {
      const exists = prev.some((f) => f.id === saved.id);
      return exists ? prev.map((f) => (f.id === saved.id ? saved : f)) : [saved, ...prev];
    });
  };

  const handleDeleteSavedFace = (id: string) => {
    setSavedFaces((prev) => prev.filter((f) => f.id !== id));
  };

  const handleActivateSlot = async (slotId: number) => {
    setStatusError(null);
    try {
      await activeTransport.activateSlot(slotId);
      setActiveSlotId(slotId);
      if (slotConfigs[slotId]) {
        setConfig({ ...slotConfigs[slotId] });
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to boot slot.');
    }
  };

  const handleTouchPillTap = () => {
    if (activeNotification) {
      setActiveNotification(null);
      return;
    }
    const nextSlot = (activeSlotId + 1) % slots.length;
    setActiveSlotId(nextSlot);
    if (slotConfigs[nextSlot]) {
      setConfig({ ...slotConfigs[nextSlot] });
    }
  };

  const handleSyncTime = async () => {
    setStatusError(null);
    try {
      await activeTransport.syncTime(new Date());
      setTelemetry((prev) => ({
        ...prev,
        lastSyncAt: new Date().toLocaleTimeString(),
      }));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Time sync failed.');
    }
  };

  const handleFindBand = async () => {
    setStatusError(null);
    try {
      await activeTransport.findBand();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Find band failed.');
    }
  };

  const handlePushNotification = async (
    title: string,
    body: string,
    app: 'WhatsApp' | 'Calls' | 'SMS' | 'System'
  ) => {
    setStatusError(null);
    try {
      await activeTransport.pushNotification(title, body, app);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Notification failed.');
    }
  };

  const handleDiscoverServices = async () => {
    setStatusError(null);
    try {
      const discovered = await activeTransport.discoverServices();
      setServices(discovered);
      setMapping((prev) => pickWritableMapping(discovered, prev));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Service discovery failed.');
    }
  };

  const handleSendRawHex = async (
    serviceUuid: string,
    charUuid: string,
    bytes: Uint8Array
  ) => {
    setStatusError(null);
    try {
      await activeTransport.sendRawPacket(serviceUuid, charUuid, bytes);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Raw packet write failed.');
    }
  };

  const handleSimulateActivity = () => {
    setTelemetry((prev) => ({
      ...prev,
      steps: prev.steps + 245,
      calories: prev.calories + 12,
      heartRate: 68 + Math.floor(Math.random() * 28),
      lastSyncAt: new Date().toLocaleTimeString(),
    }));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Watch size={20} />
          </div>
          <div>
            <h1>Fastrack Reflex 3.0 Studio</h1>
            <p>Web Bluetooth Companion &amp; Custom Watchface Bootloader</p>
          </div>
        </div>

        <nav className="tab-nav">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            <Palette size={15} />
            <span>Watchface Studio</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'band' ? 'active' : ''}`}
            onClick={() => setActiveTab('band')}
          >
            <Layers size={15} />
            <span>Boot &amp; Band Tools</span>
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'ble' ? 'active' : ''}`}
            onClick={() => setActiveTab('ble')}
          >
            <Radio size={15} />
            <span>BLE Inspector</span>
          </button>
        </nav>

        <div className="connect-area">
          <div className="mode-pill-switch" title="Choose Bluetooth transport">
            <button
              type="button"
              className={`mode-pill-btn ${transportMode === 'mock' ? 'active' : ''}`}
              onClick={() => void handleSwitchMode('mock')}
            >
              Sim
            </button>
            <button
              type="button"
              className={`mode-pill-btn ${transportMode === 'web-bluetooth' ? 'active' : ''}`}
              onClick={() => void handleSwitchMode('web-bluetooth')}
            >
              Web BLE
            </button>
          </div>
          <button
            type="button"
            className={`btn ${
              connectionState === 'connected' ? 'btn-connected' : 'btn-primary'
            }`}
            disabled={connectionState === 'connecting'}
            onClick={handleConnectToggle}
          >
            {connectionState === 'connected' ? (
              <>
                <BluetoothConnected size={16} />
                <span>Disconnect</span>
              </>
            ) : (
              <>
                <Bluetooth size={16} />
                <span>
                  {connectionState === 'connecting'
                    ? 'Connecting…'
                    : transportMode === 'mock'
                      ? 'Connect Simulator'
                      : 'Pair via Web BLE'}
                </span>
              </>
            )}
          </button>
        </div>
      </header>

      {statusError && (
        <div className="global-error">
          <span>{statusError}</span>
          <div className="global-error-actions">
            {transportMode === 'web-bluetooth' && (
              <button
                type="button"
                onClick={async () => {
                  await handleSwitchMode('mock');
                }}
              >
                Use Simulator
              </button>
            )}
            <button type="button" onClick={() => setStatusError(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="workspace-grid">
        <aside className="preview-column">
          <ReflexBandPreview
            config={config}
            telemetry={telemetry}
            now={now}
            connectionState={connectionState}
            transportMode={transportMode}
            isVibrating={isVibrating}
            activeNotification={activeNotification}
            uploadProgress={uploadProgress}
            onCaptureFrame={handleFrameCaptured}
            captureSignal={captureSignal}
            onTouchPillTap={handleTouchPillTap}
          />
          <div className="preview-hint">
            Tap the band&apos;s bottom touch key to cycle slots or dismiss alerts.
          </div>
        </aside>

        <section className="editor-column">
          {activeTab === 'studio' && (
            <WatchfaceEditor
              config={config}
              savedFaces={savedFaces}
              onChange={setConfig}
              onSaveFace={handleSaveFace}
              onDeleteSavedFace={handleDeleteSavedFace}
            />
          )}

          {activeTab === 'band' && (
            <BandFeaturesPanel
              connectionState={connectionState}
              telemetry={telemetry}
              slots={slots}
              activeSlotId={activeSlotId}
              selectedTargetSlot={selectedTargetSlot}
              uploadProgress={uploadProgress}
              lastCrcHex={lastCrcHex}
              onSelectTargetSlot={setSelectedTargetSlot}
              onFlashToBand={handleFlashToBand}
              onActivateSlot={handleActivateSlot}
              onExportBin={handleExportBin}
              onExportJson={handleExportJson}
              onSyncTime={handleSyncTime}
              onFindBand={handleFindBand}
              onPushNotification={handlePushNotification}
              onSimulateActivity={handleSimulateActivity}
            />
          )}

          {activeTab === 'ble' && (
            <BleInspectorPanel
              transportMode={transportMode}
              connectionState={connectionState}
              deviceInfo={deviceInfo}
              services={services}
              mapping={mapping}
              extraServiceUuidsInput={extraUuidsInput}
              logs={logs}
              onChangeMode={handleSwitchMode}
              onChangeMapping={setMapping}
              onChangeExtraUuids={setExtraUuidsInput}
              onDiscoverServices={handleDiscoverServices}
              onSendRawHex={handleSendRawHex}
              onClearLogs={() => setLogs([])}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default App;

