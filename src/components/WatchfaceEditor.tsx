import type { ChangeEvent } from 'react';
import { ImagePlus, Palette, Save, Sparkles, Type } from 'lucide-react';
import { PRESET_WATCHFACES } from '../studio/presets';
import type {
  BackgroundMode,
  ClockStyle,
  FontChoice,
  WatchfaceConfig,
  WidgetKey,
} from '../types/watchface';

interface WatchfaceEditorProps {
  config: WatchfaceConfig;
  savedFaces: WatchfaceConfig[];
  onChange: (next: WatchfaceConfig) => void;
  onSaveFace: () => void;
  onDeleteSavedFace: (id: string) => void;
}

const CLOCK_STYLES: { id: ClockStyle; label: string }[] = [
  { id: 'stacked', label: 'Stacked Big' },
  { id: 'inline', label: 'Inline' },
  { id: 'minimal-ring', label: 'Goal Ring' },
  { id: 'binary-bars', label: 'Binary Matrix' },
];

const WIDGET_LABELS: { key: WidgetKey; label: string }[] = [
  { key: 'date', label: 'Day & Date' },
  { key: 'steps', label: 'Steps + Bar' },
  { key: 'heartRate', label: 'Heart Rate' },
  { key: 'battery', label: 'Battery %' },
  { key: 'calories', label: 'Calories' },
  { key: 'weather', label: 'Weather °C' },
];

export function WatchfaceEditor({
  config,
  savedFaces,
  onChange,
  onSaveFace,
  onDeleteSavedFace,
}: WatchfaceEditorProps) {
  const update = <K extends keyof WatchfaceConfig>(
    key: K,
    value: WatchfaceConfig[K]
  ) => {
    onChange({ ...config, [key]: value });
  };

  const toggleWidget = (key: WidgetKey) => {
    onChange({
      ...config,
      widgets: {
        ...config.widgets,
        [key]: !config.widgets[key],
      },
    });
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange({
          ...config,
          backgroundMode: 'image',
          bgImageDataUrl: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="panel-stack">
      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Sparkles size={16} />
            <span>Boot Face Presets</span>
          </div>
          <span className="badge">{PRESET_WATCHFACES.length} Built-in</span>
        </div>

        <div className="preset-grid">
          {PRESET_WATCHFACES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={`preset-chip ${config.id === preset.id ? 'active' : ''}`}
              onClick={() => onChange({ ...preset })}
            >
              <span
                className="preset-swatch"
                style={{
                  background: `linear-gradient(135deg, ${preset.bgColorPrimary}, ${preset.accentColor})`,
                }}
              />
              <span>{preset.name}</span>
            </button>
          ))}
        </div>

        {savedFaces.length > 0 && (
          <div className="saved-faces-block">
            <div className="sub-label">Your Saved Custom Faces</div>
            <div className="preset-grid">
              {savedFaces.map((face) => (
                <div key={face.id} className="saved-chip-wrap">
                  <button
                    type="button"
                    className={`preset-chip ${config.id === face.id ? 'active' : ''}`}
                    onClick={() => onChange({ ...face })}
                  >
                    <span
                      className="preset-swatch"
                      style={{
                        background: `linear-gradient(135deg, ${face.bgColorPrimary}, ${face.accentColor})`,
                      }}
                    />
                    <span>{face.name}</span>
                  </button>
                  <button
                    type="button"
                    className="chip-remove"
                    title="Delete saved watchface"
                    onClick={() => onDeleteSavedFace(face.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="name-save-row">
          <input
            type="text"
            className="input"
            value={config.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Custom watchface name…"
          />
          <button type="button" className="btn btn-secondary" onClick={onSaveFace}>
            <Save size={15} />
            <span>Save Face</span>
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Type size={16} />
            <span>Clock Layout & Typography</span>
          </div>
        </div>

        <div className="segmented-grid">
          {CLOCK_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              className={`seg-btn ${config.clockStyle === style.id ? 'active' : ''}`}
              onClick={() => update('clockStyle', style.id)}
            >
              {style.label}
            </button>
          ))}
        </div>

        <div className="controls-row">
          <label className="field">
            <span>Font</span>
            <select
              className="input"
              value={config.fontFamily}
              onChange={(e) => update('fontFamily', e.target.value as FontChoice)}
            >
              <option value="display">Display Bold</option>
              <option value="sans">Clean Sans</option>
              <option value="mono">Tech Mono</option>
            </select>
          </label>

          <label className="field">
            <span>Clock Color</span>
            <input
              type="color"
              className="color-input"
              value={config.clockColor}
              onChange={(e) => update('clockColor', e.target.value)}
            />
          </label>

          <label className="field">
            <span>Accent Color</span>
            <input
              type="color"
              className="color-input"
              value={config.accentColor}
              onChange={(e) => update('accentColor', e.target.value)}
            />
          </label>

          <label className="field">
            <span>Secondary</span>
            <input
              type="color"
              className="color-input"
              value={config.secondaryTextColor}
              onChange={(e) => update('secondaryTextColor', e.target.value)}
            />
          </label>
        </div>

        <div className="toggle-row">
          <label className="checkbox-pill">
            <input
              type="checkbox"
              checked={config.use24Hour}
              onChange={(e) => update('use24Hour', e.target.checked)}
            />
            <span>24-Hour Format</span>
          </label>
          <label className="checkbox-pill">
            <input
              type="checkbox"
              checked={config.showSeconds}
              onChange={(e) => update('showSeconds', e.target.checked)}
            />
            <span>Show Seconds</span>
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <Palette size={16} />
            <span>Background & Custom Photo</span>
          </div>
        </div>

        <div className="segmented-grid three">
          {(['solid', 'gradient', 'image'] as BackgroundMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`seg-btn ${config.backgroundMode === mode ? 'active' : ''}`}
              onClick={() => update('backgroundMode', mode)}
            >
              {mode === 'solid' ? 'Solid' : mode === 'gradient' ? 'Gradient' : 'Photo'}
            </button>
          ))}
        </div>

        {config.backgroundMode !== 'image' ? (
          <div className="controls-row">
            <label className="field">
              <span>Primary</span>
              <input
                type="color"
                className="color-input"
                value={config.bgColorPrimary}
                onChange={(e) => update('bgColorPrimary', e.target.value)}
              />
            </label>
            {config.backgroundMode === 'gradient' && (
              <>
                <label className="field">
                  <span>Secondary</span>
                  <input
                    type="color"
                    className="color-input"
                    value={config.bgColorSecondary}
                    onChange={(e) => update('bgColorSecondary', e.target.value)}
                  />
                </label>
                <label className="field grow">
                  <span>Angle ({config.bgGradientAngle}°)</span>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={config.bgGradientAngle}
                    onChange={(e) => update('bgGradientAngle', Number(e.target.value))}
                  />
                </label>
              </>
            )}
          </div>
        ) : (
          <div className="image-upload-box">
            <label className="btn btn-secondary upload-label">
              <ImagePlus size={15} />
              <span>Choose Wallpaper Photo</span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={handleImageUpload}
              />
            </label>
            <label className="field grow">
              <span>Darken Overlay ({Math.round(config.bgImageDim * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.05}
                value={config.bgImageDim}
                onChange={(e) => update('bgImageDim', Number(e.target.value))}
              />
            </label>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header">
          <div className="card-title">
            <span>On-Screen Widgets</span>
          </div>
        </div>
        <div className="widget-grid">
          {WIDGET_LABELS.map((item) => (
            <label key={item.key} className="checkbox-pill">
              <input
                type="checkbox"
                checked={config.widgets[item.key]}
                onChange={() => toggleWidget(item.key)}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

