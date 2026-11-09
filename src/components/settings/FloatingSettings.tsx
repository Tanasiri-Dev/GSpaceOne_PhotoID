import React from 'react';
import { useAppStore } from '../../state/store';
import { AdjustmentSlider } from './AdjustmentSlider';
import { CropTool } from './CropTool';
import { useFloatingWindow } from '../../hooks/useFloatingWindow';

export interface FloatingSettingsProps {
  isStandalone?: boolean;
  onClose?: () => void;
}

export const FloatingSettings: React.FC<FloatingSettingsProps> = ({
  isStandalone = false,
  onClose,
}) => {
  const brightness = useAppStore((state) => state.brightness);
  const exposure = useAppStore((state) => state.exposure);
  const gamma = useAppStore((state) => state.gamma);
  const selectedIdSize = useAppStore((state) => state.selectedIdSize);
  const selectedPaperSize = useAppStore((state) => state.selectedPaperSize);
  const printLayoutInfo = useAppStore((state) => state.printLayoutInfo);
  const customPhotoCount = useAppStore((state) => state.customPhotoCount);
  const setCustomPhotoCount = useAppStore((state) => state.setCustomPhotoCount);
  const isProcessing = useAppStore((state) => state.isProcessing);

  const setAdjustment = useAppStore((state) => state.setAdjustment);
  const resetAll = useAppStore((state) => state.resetAll);
  const resetAdjustments = useAppStore((state) => state.resetAdjustments);
  const resetCrop = useAppStore((state) => state.resetCrop);
  const setIdSize = useAppStore((state) => state.setIdSize);
  const setPaperSize = useAppStore((state) => state.setPaperSize);
  const showBrandLogo = useAppStore((state) => state.showBrandLogo);
  const setShowBrandLogo = useAppStore((state) => state.setShowBrandLogo);
  const fetchImageInfo = useAppStore((state) => state.fetchImageInfo);
  const setShowInfoModal = useAppStore((state) => state.setShowInfoModal);

  const { openSettingsWindow, closeSettingsWindow, isCurrentWindowSettings } = useFloatingWindow();
  const isDetached = isStandalone || isCurrentWindowSettings();

  const handleTogglePopOut = async () => {
    if (isDetached) {
      await closeSettingsWindow();
      if (onClose) onClose();
    } else {
      await openSettingsWindow();
    }
  };

  return (
    <div
      className={
        isDetached
          ? 'floating-settings-container'
          : 'side-panel'
      }
    >
      {/* Header */}
      <div className={isDetached ? 'floating-settings-header' : 'side-panel-header'}>
        <div className="side-panel-title">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Photo & Print Settings
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleTogglePopOut}
            title={isDetached ? 'Dock settings to main window' : 'Pop out settings into floating window'}
          >
            {isDetached ? 'Dock ↙' : 'Pop Out ↗'}
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className={isDetached ? 'floating-settings-content' : 'side-panel-body'}>
        {/* Section 1: Color Adjustments */}
        <section className="settings-section">
          <div className="section-header">
            <span className="section-title">Color Adjustments</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={resetAdjustments}
              title="Reset brightness, exposure, and gamma"
            >
              Reset
            </button>
          </div>

          <AdjustmentSlider
            label="Brightness"
            value={brightness}
            min={-100}
            max={100}
            step={1}
            defaultValue={0}
            unit="%"
            onChange={(val) => setAdjustment('brightness', val)}
            disabled={isProcessing}
          />

          <AdjustmentSlider
            label="Exposure"
            value={exposure}
            min={-3.0}
            max={3.0}
            step={0.05}
            defaultValue={0}
            unit="EV"
            onChange={(val) => setAdjustment('exposure', val)}
            disabled={isProcessing}
          />

          <AdjustmentSlider
            label="Gamma"
            value={gamma}
            min={0.1}
            max={5.0}
            step={0.05}
            defaultValue={1.0}
            onChange={(val) => setAdjustment('gamma', val)}
            disabled={isProcessing}
          />
        </section>

        {/* Section 2: Crop Tool */}
        <section className="settings-section">
          <div className="section-header">
            <span className="section-title">Crop & Framing</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={resetCrop}
              title="Reset crop box back to original uncropped image"
            >
              Reset to Original
            </button>
          </div>
          <CropTool />
        </section>

        {/* Section 3: Print Layout Setup */}
        <section className="settings-section">
          <div className="section-header">
            <span className="section-title">Print Format</span>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="id-size-select">
              ID Photo Size
            </label>
            <select
              id="id-size-select"
              className="select-input"
              value={selectedIdSize}
              onChange={(e) => setIdSize(e.target.value)}
            >
              <option value='1"'>1" (25 × 35 mm)</option>
              <option value='1.5"'>1.5" (35 × 45 mm Standard)</option>
              <option value='2"'>2" (50.8 × 50.8 mm US Passport)</option>
              <option value='2.5"'>2.5" (60 × 70 mm)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="paper-size-select">
              Paper Size
            </label>
            <select
              id="paper-size-select"
              className="select-input"
              value={selectedPaperSize}
              onChange={(e) => setPaperSize(e.target.value)}
            >
              <option value="4×6">4 × 6 inches (102 × 152 mm)</option>
              <option value="5×7">5 × 7 inches (127 × 178 mm)</option>
              <option value="A4">A4 (210 × 297 mm)</option>
              <option value="Letter">Letter (216 × 279 mm)</option>
            </select>
          </div>

          {/* Photos to Print on Sheet */}
          {(() => {
            const maxPhotos = printLayoutInfo?.photoCount || 6;
            const effectiveCount = customPhotoCount !== null ? Math.min(customPhotoCount, maxPhotos) : maxPhotos;
            return (
              <div className="form-group" style={{ marginTop: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Photos on Sheet
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Max: {maxPhotos} photos
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', minWidth: '24px', height: '28px' }}
                    disabled={effectiveCount <= 1}
                    onClick={() => setCustomPhotoCount(Math.max(1, effectiveCount - 1))}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxPhotos}
                    className="select-input"
                    style={{ flex: 1, textAlign: 'center', padding: '4px' }}
                    value={effectiveCount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setCustomPhotoCount(isNaN(val) ? null : Math.max(1, Math.min(val, maxPhotos)));
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', minWidth: '24px', height: '28px' }}
                    disabled={effectiveCount >= maxPhotos}
                    onClick={() => setCustomPhotoCount(Math.min(maxPhotos, effectiveCount + 1))}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', height: '28px' }}
                    onClick={() => setCustomPhotoCount(null)}
                    title="Fill all available slots on sheet"
                  >
                    Max
                  </button>
                </div>
              </div>
            );
          })()}

          <div
            className="form-group checkbox-group"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: 'var(--space-md)',
              padding: '6px 10px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <input
              type="checkbox"
              id="settings-toggle-logo"
              checked={showBrandLogo}
              onChange={(e) => setShowBrandLogo(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                accentColor: 'var(--accent-light)',
                cursor: 'pointer',
              }}
            />
            <label
              htmlFor="settings-toggle-logo"
              style={{
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                userSelect: 'none',
              }}
            >
              Include GSpaceOne Logo on Sheet
            </label>
          </div>
        </section>

        {/* Section 4: Image Info / EXIF & Global Reset */}
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-md)', display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1, padding: '8px 10px' }}
            onClick={() => {
              fetchImageInfo();
              setShowInfoModal(true);
            }}
            title="Show EXIF Metadata & Image Information"
          >
            ℹ️ Info / EXIF
          </button>
          <button
            type="button"
            className="btn btn-danger"
            style={{ flex: 1, padding: '8px 10px' }}
            onClick={resetAll}
            title="Reset all adjustments, crop, and framing"
          >
            Reset All
          </button>
        </div>
      </div>
    </div>
  );
};
