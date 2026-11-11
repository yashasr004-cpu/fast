import { useEffect, useRef } from 'react';
import { Bluetooth, BluetoothOff, Smartphone, Vibrate } from 'lucide-react';
import type { ConnectionState, TransportMode, UploadProgress } from '../ble/types';
import { renderWatchfaceToCanvas } from '../studio/renderer';
import {
  REFLEX_HEIGHT,
  REFLEX_WIDTH,
  type WatchfaceConfig,
  type WatchNotification,
  type WatchTelemetry,
} from '../types/watchface';

interface ReflexBandPreviewProps {
  config: WatchfaceConfig;
  telemetry: WatchTelemetry;
  now: Date;
  connectionState: ConnectionState;
  transportMode: TransportMode;
  isVibrating: boolean;
  activeNotification: WatchNotification | null;
  uploadProgress: UploadProgress | null;
  onCaptureFrame?: (rgba: Uint8ClampedArray) => void;
  captureSignal?: number;
  onTouchPillTap?: () => void;
}

export function ReflexBandPreview({
  config,
  telemetry,
  now,
  connectionState,
  transportMode,
  isVibrating,
  activeNotification,
  uploadProgress,
  onCaptureFrame,
  captureSignal,
  onTouchPillTap,
}: ReflexBandPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (config.backgroundMode === 'image' && config.bgImageDataUrl) {
      const img = new Image();
      img.src = config.bgImageDataUrl;
      img.onload = () => {
        bgImageRef.current = img;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (ctx) {
          renderWatchfaceToCanvas(ctx, config, telemetry, now, {
            bgImage: img,
            activeNotification,
          });
        }
      };
    } else {
      bgImageRef.current = null;
    }
  }, [config.backgroundMode, config.bgImageDataUrl, config, telemetry, now, activeNotification]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    renderWatchfaceToCanvas(ctx, config, telemetry, now, {
      bgImage: bgImageRef.current,
      activeNotification,
    });
  }, [config, telemetry, now, activeNotification]);

  useEffect(() => {
    if (!captureSignal || !onCaptureFrame) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    renderWatchfaceToCanvas(ctx, config, telemetry, now, {
      bgImage: bgImageRef.current,
      activeNotification: null,
    });
    const imageData = ctx.getImageData(0, 0, REFLEX_WIDTH, REFLEX_HEIGHT);
    onCaptureFrame(imageData.data);
  }, [captureSignal]);

  const isConnected = connectionState === 'connected';

  return (
    <div className="band-stage">
      <div className="band-status-pill">
        {isConnected ? (
          <Bluetooth size={14} className="text-emerald" />
        ) : (
          <BluetoothOff size={14} className="text-muted" />
        )}
        <span>
          {isConnected
            ? transportMode === 'mock'
              ? 'Connected • Reflex 3.0 Sim'
              : 'Connected • Web BLE'
            : 'Band Disconnected'}
        </span>
      </div>

      <div className={`reflex-hardware ${isVibrating ? 'is-vibrating' : ''}`}>
        <div className="strap strap-top">
          <div className="strap-ridge" />
          <div className="strap-ridge" />
        </div>

        <div className="band-body">
          <div className="band-bezel">
            <div className="band-screen-frame">
              <canvas
                ref={canvasRef}
                width={REFLEX_WIDTH}
                height={REFLEX_HEIGHT}
                className="band-canvas"
              />
              {uploadProgress && (
                <div className="band-flash-overlay">
                  <div className="flash-ring">{uploadProgress.percent}%</div>
                  <div className="flash-label">FLASHING</div>
                </div>
              )}
              {isVibrating && (
                <div className="band-buzz-badge">
                  <Vibrate size={13} />
                  <span>BUZZ</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="band-touch-pill"
              title="Tap capacitive touch key (cycles preview or dismisses alert)"
              onClick={onTouchPillTap}
            >
              <span className="touch-bar" />
            </button>
          </div>
        </div>

        <div className="strap strap-bottom">
          <div className="strap-ridge" />
          <div className="strap-ridge" />
        </div>
      </div>

      <div className="band-spec-note">
        <Smartphone size={13} />
        <span>0.96&quot; TFT • 80 × 160 px • RGB565</span>
      </div>
    </div>
  );
}

