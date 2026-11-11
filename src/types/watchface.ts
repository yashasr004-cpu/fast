export const REFLEX_WIDTH = 80;
export const REFLEX_HEIGHT = 160;

export type ClockStyle = 'stacked' | 'inline' | 'minimal-ring' | 'binary-bars';
export type BackgroundMode = 'solid' | 'gradient' | 'image';
export type FontChoice = 'sans' | 'mono' | 'display';

export type WidgetKey =
  | 'date'
  | 'steps'
  | 'heartRate'
  | 'battery'
  | 'calories'
  | 'weather';

export interface WatchfaceConfig {
  id: string;
  name: string;
  backgroundMode: BackgroundMode;
  bgColorPrimary: string;
  bgColorSecondary: string;
  bgGradientAngle: number;
  bgImageDataUrl?: string;
  bgImageDim: number;
  clockStyle: ClockStyle;
  use24Hour: boolean;
  showSeconds: boolean;
  clockColor: string;
  accentColor: string;
  secondaryTextColor: string;
  fontFamily: FontChoice;
  widgets: Record<WidgetKey, boolean>;
}

export interface WatchTelemetry {
  steps: number;
  stepGoal: number;
  heartRate: number;
  battery: number;
  calories: number;
  weatherLabel: string;
  tempC: number;
  sleepHours: number;
  lastSyncAt: string;
}

export interface WatchNotification {
  id: string;
  app: 'WhatsApp' | 'Calls' | 'SMS' | 'System';
  title: string;
  body: string;
  receivedAt: string;
}

export interface WatchSlot {
  slotId: number;
  label: string;
  watchfaceId: string;
  watchfaceName: string;
  previewDataUrl?: string;
  updatedAt: string;
}

