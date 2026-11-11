import {
  REFLEX_HEIGHT,
  REFLEX_WIDTH,
  type FontChoice,
  type WatchfaceConfig,
  type WatchNotification,
  type WatchTelemetry,
} from '../types/watchface';

const FONT_MAP: Record<FontChoice, string> = {
  sans: 'Inter, system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "Consolas", monospace',
  display: '"Space Grotesk", "Trebuchet MS", sans-serif',
};

function drawBackground(
  ctx: CanvasRenderingContext2D,
  config: WatchfaceConfig,
  bgImage?: HTMLImageElement | null
): void {
  if (config.backgroundMode === 'solid') {
    ctx.fillStyle = config.bgColorPrimary;
    ctx.fillRect(0, 0, REFLEX_WIDTH, REFLEX_HEIGHT);
    return;
  }

  if (config.backgroundMode === 'image' && bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    const targetRatio = REFLEX_WIDTH / REFLEX_HEIGHT;
    const imgRatio = bgImage.naturalWidth / bgImage.naturalHeight;
    let drawW = REFLEX_WIDTH;
    let drawH = REFLEX_HEIGHT;
    let offsetX = 0;
    let offsetY = 0;

    if (imgRatio > targetRatio) {
      drawH = REFLEX_HEIGHT;
      drawW = REFLEX_HEIGHT * imgRatio;
      offsetX = (REFLEX_WIDTH - drawW) / 2;
    } else {
      drawW = REFLEX_WIDTH;
      drawH = REFLEX_WIDTH / imgRatio;
      offsetY = (REFLEX_HEIGHT - drawH) / 2;
    }
    ctx.drawImage(bgImage, offsetX, offsetY, drawW, drawH);
    ctx.fillStyle = `rgba(0, 0, 0, ${config.bgImageDim})`;
    ctx.fillRect(0, 0, REFLEX_WIDTH, REFLEX_HEIGHT);
    return;
  }

  const rad = (config.bgGradientAngle * Math.PI) / 180;
  const cx = REFLEX_WIDTH / 2;
  const cy = REFLEX_HEIGHT / 2;
  const dx = Math.cos(rad) * REFLEX_WIDTH;
  const dy = Math.sin(rad) * REFLEX_HEIGHT;
  const grad = ctx.createLinearGradient(cx - dx / 2, cy - dy / 2, cx + dx / 2, cy + dy / 2);
  grad.addColorStop(0, config.bgColorPrimary);
  grad.addColorStop(1, config.bgColorSecondary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, REFLEX_WIDTH, REFLEX_HEIGHT);
}

function formatHours(date: Date, use24Hour: boolean): { hh: string; mm: string; ss: string; ampm: string } {
  const rawHours = date.getHours();
  const displayHours = use24Hour ? rawHours : rawHours % 12 || 12;
  return {
    hh: String(displayHours).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
    ampm: use24Hour ? '' : rawHours >= 12 ? 'PM' : 'AM',
  };
}

function drawTopBar(
  ctx: CanvasRenderingContext2D,
  config: WatchfaceConfig,
  telemetry: WatchTelemetry,
  date: Date
): void {
  const font = FONT_MAP[config.fontFamily];
  ctx.font = `600 8px ${font}`;
  ctx.textBaseline = 'top';

  if (config.widgets.date) {
    const dayStr = date
      .toLocaleDateString('en-US', { weekday: 'short', day: '2-digit' })
      .toUpperCase();
    ctx.fillStyle = config.secondaryTextColor;
    ctx.textAlign = 'left';
    ctx.fillText(dayStr, 6, 7);
  }

  if (config.widgets.battery) {
    ctx.textAlign = 'right';
    ctx.fillStyle = telemetry.battery <= 20 ? '#ef4444' : config.accentColor;
    ctx.fillText(`${telemetry.battery}%`, REFLEX_WIDTH - 6, 7);
  }
}

function drawClock(
  ctx: CanvasRenderingContext2D,
  config: WatchfaceConfig,
  telemetry: WatchTelemetry,
  date: Date
): void {
  const font = FONT_MAP[config.fontFamily];
  const { hh, mm, ss, ampm } = formatHours(date, config.use24Hour);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (config.clockStyle === 'stacked') {
    ctx.font = `800 32px ${font}`;
    ctx.fillStyle = config.clockColor;
    ctx.fillText(hh, REFLEX_WIDTH / 2, 46);

    ctx.fillStyle = config.accentColor;
    ctx.fillText(mm, REFLEX_WIDTH / 2, 78);

    if (config.showSeconds || ampm) {
      ctx.font = `700 8px ${font}`;
      ctx.fillStyle = config.secondaryTextColor;
      const sub = [ampm, config.showSeconds ? `:${ss}` : ''].filter(Boolean).join(' ');
      ctx.fillText(sub, REFLEX_WIDTH / 2, 98);
    }
    return;
  }

  if (config.clockStyle === 'inline') {
    ctx.font = `800 20px ${font}`;
    ctx.fillStyle = config.clockColor;
    ctx.fillText(`${hh}:${mm}`, REFLEX_WIDTH / 2, 58);

    ctx.font = `700 8px ${font}`;
    ctx.fillStyle = config.accentColor;
    const sub = [ampm, config.showSeconds ? `${ss}s` : ''].filter(Boolean).join(' • ');
    if (sub) {
      ctx.fillText(sub, REFLEX_WIDTH / 2, 74);
    }
    return;
  }

  if (config.clockStyle === 'minimal-ring') {
    const cx = REFLEX_WIDTH / 2;
    const cy = 60;
    const radius = 29;
    const pct = Math.min(1, telemetry.steps / Math.max(1, telemetry.stepGoal));

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = config.accentColor;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();

    ctx.font = `800 15px ${font}`;
    ctx.fillStyle = config.clockColor;
    ctx.fillText(`${hh}:${mm}`, cx, cy - 2);

    ctx.font = `600 7px ${font}`;
    ctx.fillStyle = config.secondaryTextColor;
    ctx.fillText(config.showSeconds ? `${ss}s` : ampm || '24H', cx, cy + 12);
    return;
  }

  // binary-bars style
  ctx.font = `700 18px ${font}`;
  ctx.fillStyle = config.clockColor;
  ctx.fillText(`${hh}:${mm}`, REFLEX_WIDTH / 2, 42);

  const digits = [
    Math.floor(Number(hh) / 10),
    Number(hh) % 10,
    Math.floor(Number(mm) / 10),
    Number(mm) % 10,
  ];
  const startX = 15;
  const startY = 58;
  for (let col = 0; col < 4; col += 1) {
    const val = digits[col];
    for (let bit = 0; bit < 4; bit += 1) {
      const active = (val & (1 << (3 - bit))) !== 0;
      ctx.fillStyle = active ? config.accentColor : 'rgba(255,255,255,0.14)';
      ctx.fillRect(startX + col * 14, startY + bit * 7, 10, 5);
    }
  }
}

function drawWidgets(
  ctx: CanvasRenderingContext2D,
  config: WatchfaceConfig,
  telemetry: WatchTelemetry
): void {
  const font = FONT_MAP[config.fontFamily];
  let y = 108;

  if (config.widgets.steps) {
    const pct = Math.min(1, telemetry.steps / Math.max(1, telemetry.stepGoal));
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(8, y, REFLEX_WIDTH - 16, 4);
    ctx.fillStyle = config.accentColor;
    ctx.fillRect(8, y, Math.max(3, Math.round((REFLEX_WIDTH - 16) * pct)), 4);

    ctx.font = `600 8px ${font}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = config.clockColor;
    ctx.fillText(`STP ${telemetry.steps}`, 8, y + 6);
    y += 18;
  }

  const pills: string[] = [];
  if (config.widgets.heartRate) pills.push(`HR ${telemetry.heartRate}`);
  if (config.widgets.calories) pills.push(`${telemetry.calories}cal`);
  if (config.widgets.weather) pills.push(`${telemetry.tempC}°C`);

  ctx.font = `600 8px ${font}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let i = 0; i < pills.length && y <= 146; i += 1) {
    ctx.fillStyle = i === 0 ? config.secondaryTextColor : config.accentColor;
    ctx.fillText(pills[i], 8, y);
    y += 11;
  }
}

function drawNotificationOverlay(
  ctx: CanvasRenderingContext2D,
  config: WatchfaceConfig,
  notification: WatchNotification
): void {
  const font = FONT_MAP[config.fontFamily];
  ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
  ctx.fillRect(4, 24, REFLEX_WIDTH - 8, REFLEX_HEIGHT - 48);
  ctx.strokeStyle = config.accentColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(4.5, 24.5, REFLEX_WIDTH - 9, REFLEX_HEIGHT - 49);

  ctx.font = `700 8px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = config.accentColor;
  ctx.fillText(notification.app.toUpperCase(), 9, 31);

  ctx.font = `700 9px ${font}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(notification.title.slice(0, 12), 9, 46);

  ctx.font = `500 8px ${font}`;
  ctx.fillStyle = '#cbd5e1';
  const words = notification.body.split(' ');
  let line = '';
  let lineY = 62;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > REFLEX_WIDTH - 18) {
      ctx.fillText(line, 9, lineY);
      line = word;
      lineY += 11;
      if (lineY > 120) break;
    } else {
      line = candidate;
    }
  }
  if (line && lineY <= 120) {
    ctx.fillText(line, 9, lineY);
  }
}

export function renderWatchfaceToCanvas(
  ctx: CanvasRenderingContext2D,
  config: WatchfaceConfig,
  telemetry: WatchTelemetry,
  date: Date,
  options?: {
    bgImage?: HTMLImageElement | null;
    activeNotification?: WatchNotification | null;
  }
): void {
  ctx.clearRect(0, 0, REFLEX_WIDTH, REFLEX_HEIGHT);
  drawBackground(ctx, config, options?.bgImage);
  drawTopBar(ctx, config, telemetry, date);
  drawClock(ctx, config, telemetry, date);
  drawWidgets(ctx, config, telemetry);

  if (options?.activeNotification) {
    drawNotificationOverlay(ctx, config, options.activeNotification);
  }
}

