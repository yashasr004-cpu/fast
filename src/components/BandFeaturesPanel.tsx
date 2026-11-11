import { useState } from 'react';
import {
  Activity,
  Bell,
  Clock,
  Cpu,
  Download,
  Footprints,
  Heart,
  Layers,
  Upload,
  Vibrate,
} from 'lucide-react';
import type { ConnectionState, UploadProgress } from '../ble/types';
import type { WatchSlot, WatchTelemetry } from '../types/watchface';

interface BandFeaturesPanelProps {
  connectionState: ConnectionState;
  telemetry: WatchTelemetry;
  slots: WatchSlot[];
  activeSlotId: number;
  selectedTargetSlot: number;
  uploadProgress: UploadProgress | null;
  lastCrcHex: string | null;
  onSelectTargetSlot: (slotId: number) => void;
  onFlashToBand: () => void;
  onActivateSlot: (slotId: number) => void;
  onExportBin: () => void;
  onExportJson: () => void;
  onSyncTime: () => void;
  onFindBand: () => void;
  onPushNotification: (title: string, body: string, app: 'WhatsApp' | 'Calls' | 'SMS' | 'System') => void;
  onSimulateActivity: () => void;
}

export function BandFeaturesPanel({
  connectionState,
  telemetry,
  slots,
  activeSlotId,
  selectedTargetSlot,
  uploadProgress,
  lastCrcHex,
  onSelectTargetSlot,
  onFlashToBand,
  onActivateSlot,
  onExportBin,
  onExportJson,
  onSyncTime,
  onFindBand,
  onPushNotification,
  onSimulateActivity,
}: BandFeaturesPanelProps) {
  const [notifApp, setNotifApp] = useState<'WhatsApp' | 'Calls' | 'SMS' | 'System'>('WhatsApp');
  const [notifTitle, setNotifTitle] = useState('Aarav');
  const [notifBody, setNotifBody] = useState('Evening run at 6:30 PM?');

  const isConnected = connectionState === 'connected';
  const stepPct = Math.min(100, Math.round((telemetry.steps / telemetry.stepGoal) * 100));

  return (
    <div className="panel-stack">
      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Layers size={16} />
            <span>Boot & Flash Custom Watchface</span>
          </div>
          {lastCrcHex && <span className="badge">CRC {lastCrcHex}</span>}
        </div>

        <div className="slot-grid">
          {slots.map((slot) => {
            const isTarget = selectedTargetSlot === slot.slotId;
            const isActive = activeSlotId === slot.slotId;
            return (
              <div
                key={slot.slotId}
                className={`slot-card ${isTarget ? 'selected' : ''}`}
                onClick={() => onSelectTargetSlot(slot.slotId)}
              >
                <div className="slot-head">
                  <span className="slot-num">{slot.label}</span>
                  {isActive && <span className="badge badge-emerald">ACTIVE</span>}
                </div>
                <div className="slot-name">{slot.watchfaceName}</div>
                <div className="slot-meta">{slot.updatedAt}</div>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  disabled={!isConnected || isActive}
                  onClick={(e) => {
                    e.stopPropagation();
                    onActivateSlot(slot.slotId);
                  }}
                >
                  {isActive ? 'Booted' : 'Boot Slot'}
                </button>
              </div>
            );
          })}
        </div>

        {uploadProgress && (
          <div className="progress-box">
            <div className="progress-head">
              <span>{uploadProgress.stage}</span>
              <span>{uploadProgress.percent}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
            <div className="progress-sub">
              {uploadProgress.sentBytes} / {uploadProgress.totalBytes} bytes • Chunk{' '}
              {uploadProgress.chunkIndex}/{uploadProgress.totalChunks}
            </div>
          </div>
        )}

        <div className="action-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isConnected || Boolean(uploadProgress)}
            onClick={onFlashToBand}
          >
            <Upload size={15} />
            <span>Flash &amp; Boot to Slot #{selectedTargetSlot + 1}</span>
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExportBin}>
            <Download size={15} />
            <span>Export .bin (RGB565)</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={onExportJson}>
            <Download size={15} />
            <span>Export .json</span>
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Cpu size={16} />
            <span>Band Quick Controls</span>
          </div>
        </div>
        <div className="action-row">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!isConnected}
            onClick={onSyncTime}
          >
            <Clock size={15} />
            <span>Sync Watch Time</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!isConnected}
            onClick={onFindBand}
          >
            <Vibrate size={15} />
            <span>Find My Band</span>
          </button>
          <button type="button" className="btn btn-ghost" onClick={onSimulateActivity}>
            <Activity size={15} />
            <span>Simulate Live Telemetry</span>
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Bell size={16} />
            <span>Notification Alert Tester</span>
          </div>
        </div>

        <div className="controls-row">
          <label className="field">
            <span>App</span>
            <select
              className="input"
              value={notifApp}
              onChange={(e) =>
                setNotifApp(
                  e.target.value as 'WhatsApp' | 'Calls' | 'SMS' | 'System'
                )
              }
            >
              <option value="WhatsApp">WhatsApp</option>
              <option value="Calls">Calls</option>
              <option value="SMS">SMS</option>
              <option value="System">System</option>
            </select>
          </label>
          <label className="field grow">
            <span>Sender / Title</span>
            <input
              type="text"
              className="input"
              value={notifTitle}
              onChange={(e) => setNotifTitle(e.target.value)}
            />
          </label>
        </div>

        <div className="name-save-row">
          <input
            type="text"
            className="input"
            value={notifBody}
            onChange={(e) => setNotifBody(e.target.value)}
            placeholder="Notification message…"
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!isConnected}
            onClick={() => onPushNotification(notifTitle, notifBody, notifApp)}
          >
            <Bell size={15} />
            <span>Send to Band</span>
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Heart size={16} />
            <span>Band Telemetry Snapshot</span>
          </div>
          <span className="badge">Synced: {telemetry.lastSyncAt}</span>
        </div>

        <div className="telemetry-grid">
          <div className="metric-tile">
            <div className="metric-label">
              <Footprints size={13} /> Steps ({stepPct}%)
            </div>
            <div className="metric-val">
              {telemetry.steps.toLocaleString()}
              <span className="metric-sub"> / {telemetry.stepGoal.toLocaleString()}</span>
            </div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">
              <Heart size={13} /> Heart Rate
            </div>
            <div className="metric-val">
              {telemetry.heartRate} <span className="metric-sub">BPM</span>
            </div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">Calories</div>
            <div className="metric-val">
              {telemetry.calories} <span className="metric-sub">kcal</span>
            </div>
          </div>
          <div className="metric-tile">
            <div className="metric-label">Sleep</div>
            <div className="metric-val">
              {telemetry.sleepHours} <span className="metric-sub">hrs</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

