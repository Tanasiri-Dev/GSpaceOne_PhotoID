import React, { useCallback, useId, useState, useEffect } from 'react';

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
  const [textInput, setTextInput] = useState<string>(() => value.toString());

  // Sync text input with incoming value prop (e.g. from slider drag or reset)
  useEffect(() => {
    setTextInput(value.toString());
  }, [value]);

  // Reset to default value on double-click
  const handleDoubleClick = useCallback(() => {
    if (!disabled) {
      onChange(defaultValue);
      setTextInput(defaultValue.toString());
    }
  }, [disabled, defaultValue, onChange]);

  const handleSliderInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const val = parseFloat((e.target as HTMLInputElement).value) as T;
      onChange(val);
      setTextInput(val.toString());
    },
    [onChange]
  );

  const commitValue = useCallback(
    (raw: string) => {
      let parsed = parseFloat(raw);
      if (isNaN(parsed)) {
        parsed = defaultValue;
      }
      const clamped = Math.max(min, Math.min(max, parsed));
      const precision = step < 0.1 ? 2 : step < 1 ? 1 : 0;
      const rounded = parseFloat(clamped.toFixed(precision)) as T;
      setTextInput(rounded.toString());
      onChange(rounded);
    },
    [defaultValue, min, max, step, onChange]
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextInput(raw);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed as T);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitValue(textInput);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setTextInput(value.toString());
      (e.target as HTMLInputElement).blur();
    }
  };

  // Calculate percentage for dynamic track gradient fill
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div className={`slider-container ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="slider-header">
        <label htmlFor={inputId} className="slider-label" onDoubleClick={handleDoubleClick} title="Double-click to reset">
          {label}
        </label>
        <div className="slider-input-group">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={textInput}
            disabled={disabled}
            onChange={handleTextChange}
            onBlur={() => commitValue(textInput)}
            onKeyDown={handleKeyDown}
            className="slider-number-input"
            title="Type value directly or use arrows. Press Enter to confirm."
            aria-label={`${label} numeric input`}
          />
          {unit && <span className="slider-unit">{unit}</span>}
        </div>
      </div>

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onInput={handleSliderInput}
        onChange={handleSliderInput}
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
