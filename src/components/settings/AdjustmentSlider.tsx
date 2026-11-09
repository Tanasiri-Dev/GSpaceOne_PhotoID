import React, { useCallback, useId } from 'react';

export interface AdjustmentSliderProps<T extends number = number> {
  label: string;
  value: T;
  min: number;
  max: number;
  step: number;
  defaultValue: T;
  unit?: string;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function AdjustmentSlider<T extends number = number>({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  unit = '',
  onChange,
  disabled = false,
}: AdjustmentSliderProps<T>) {
  const inputId = useId();

  // Reset to default value on double-click
  const handleDoubleClick = useCallback(() => {
    if (!disabled) {
      onChange(defaultValue);
    }
  }, [disabled, defaultValue, onChange]);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const val = parseFloat((e.target as HTMLInputElement).value) as T;
      onChange(val);
    },
    [onChange]
  );

  // Format display string nicely
  const formatDisplayValue = (val: number): string => {
    let formatted: string;
    if (step < 0.1) {
      formatted = val.toFixed(2);
    } else if (step < 1) {
      formatted = val.toFixed(1);
    } else {
      formatted = Math.round(val).toString();
    }

    if (val > 0 && (unit === 'EV' || label.toLowerCase().includes('brightness'))) {
      formatted = `+${formatted}`;
    }

    return unit ? `${formatted} ${unit}` : formatted;
  };

  // Calculate percentage for dynamic track gradient fill
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div className={`slider-container ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="slider-header">
        <label htmlFor={inputId} className="slider-label">
          {label}
        </label>
        <span
          className="slider-value"
          title="Double-click to reset"
          onDoubleClick={handleDoubleClick}
        >
          {formatDisplayValue(value)}
        </span>
      </div>

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onInput={handleInput}
        onChange={handleInput}
        style={{
          background: `linear-gradient(to right, var(--highlight) 0%, var(--highlight) ${percentage}%, var(--bg-tertiary) ${percentage}%, var(--bg-tertiary) 100%)`,
        }}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      />
    </div>
  );
}
