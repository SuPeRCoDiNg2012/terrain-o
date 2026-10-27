import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon, type IconName } from './Icon';

export function DebouncedTextField({
  label,
  value,
  onCommit,
  placeholder,
  multiline,
  rows = 2,
  testId,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  testId?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => {
    if (local !== value) onCommit(local);
  };
  const id = `field-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea
          id={id}
          className="text-input"
          rows={rows}
          value={local}
          onChange={(event) => setLocal(event.target.value)}
          onBlur={commit}
          placeholder={placeholder}
          data-testid={testId}
        />
      ) : (
        <input
          id={id}
          className="text-input"
          value={local}
          onChange={(event) => setLocal(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              (event.currentTarget as HTMLInputElement).blur();
            }
          }}
          placeholder={placeholder}
          data-testid={testId}
        />
      )}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  description,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <label className={`switch-row${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
      />
      <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      <span className="switch-copy">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="progress-wrap">
      {label && <div className="progress-label"><span>{label}</span><span>{Math.round(clamped)}%</span></div>}
      <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped)} aria-label={label ?? 'Avanzamento'}>
        <span style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function SectionTitle({ icon, children, aside }: { icon?: IconName; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="section-title">
      <h3>{icon && <Icon name={icon} size={16} />}{children}</h3>
      {aside}
    </div>
  );
}

export function InfoNote({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warning' | 'danger' | 'success' }) {
  return <div className={`info-note info-${tone}`}>{children}</div>;
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  reset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  display?: string;
  reset?: () => void;
}) {
  const percent = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <label className="range-field">
      <span className="range-label">
        <span>{label}</span>
        <span className="range-value-group">
          <span className="mono">{display ?? value}</span>
          {reset && (
            <button
              type="button"
              className="field-reset"
              onClick={(event) => {
                event.preventDefault();
                reset();
              }}
              title={`Reimposta ${label}`}
              aria-label={`Reimposta ${label}`}
            >
              <Icon name="refresh" size={12} />
            </button>
          )}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--range-fill': `${percent}%` } as CSSProperties}
      />
    </label>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
}) {
  return (
    <label className="options-field number-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {unit && <span className="options-unit">{unit}</span>}
    </label>
  );
}

export function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <div className="stat-track"><span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
      <span className="stat-value">{value.toFixed(1)}%</span>
    </div>
  );
}
