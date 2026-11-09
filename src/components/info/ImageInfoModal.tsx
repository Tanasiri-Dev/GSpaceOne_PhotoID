import React from 'react';
import { useAppStore } from '../../state/store';

export const ImageInfoModal: React.FC = () => {
  const showInfoModal = useAppStore((state) => state.showInfoModal);
  const setShowInfoModal = useAppStore((state) => state.setShowInfoModal);
  const imageInfo = useAppStore((state) => state.imageInfo);
  const imageDimensions = useAppStore((state) => state.imageDimensions);
  const brightness = useAppStore((state) => state.brightness);
  const exposure = useAppStore((state) => state.exposure);
  const gamma = useAppStore((state) => state.gamma);
  const cropActive = useAppStore((state) => state.cropActive);
  const cropWidth = useAppStore((state) => state.cropWidth);
  const cropHeight = useAppStore((state) => state.cropHeight);
  const selectedIdSize = useAppStore((state) => state.selectedIdSize);
  const selectedPaperSize = useAppStore((state) => state.selectedPaperSize);
  const printLayoutInfo = useAppStore((state) => state.printLayoutInfo);

  if (!showInfoModal) return null;

  return (
    <div className="modal-backdrop" onClick={() => setShowInfoModal(false)}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            Image Information & EXIF Data
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setShowInfoModal(false)}
            title="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* File Information */}
          <div className="info-section">
            <h4 className="info-section-title">📁 File Information</h4>
            <div className="info-grid">
              <div className="info-row">
                <span className="info-label">File Name</span>
                <span className="info-value" title={imageInfo?.filePath || ''}>
                  {imageInfo?.fileName || 'Unsaved'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">File Size</span>
                <span className="info-value">{imageInfo?.fileSizeFormatted || 'Unknown'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Resolution</span>
                <span className="info-value">
                  {imageDimensions ? `${imageDimensions.width} × ${imageDimensions.height} px` : '—'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Megapixels</span>
                <span className="info-value">{imageInfo?.megapixels || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Native Aspect</span>
                <span className="info-value">{imageInfo?.aspectRatio || '—'}</span>
              </div>
            </div>
          </div>

          {/* EXIF Camera Metadata */}
          <div className="info-section">
            <h4 className="info-section-title">📷 Camera & EXIF Data</h4>
            <div className="info-grid">
              <div className="info-row">
                <span className="info-label">Camera Model</span>
                <span className="info-value">{imageInfo?.cameraModel || 'None / Stripped'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Lens</span>
                <span className="info-value">{imageInfo?.lensModel || 'Standard / None'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">ISO Speed</span>
                <span className="info-value">{imageInfo?.iso || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Shutter Speed</span>
                <span className="info-value">{imageInfo?.shutterSpeed || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Aperture</span>
                <span className="info-value">{imageInfo?.aperture || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Date Taken</span>
                <span className="info-value">{imageInfo?.dateTime || '—'}</span>
              </div>
            </div>
          </div>

          {/* Adjustments & Print Settings */}
          <div className="info-section">
            <h4 className="info-section-title">⚙️ Adjustments & Print Specifications</h4>
            <div className="info-grid">
              <div className="info-row">
                <span className="info-label">Color Pipeline</span>
                <span className="info-value">
                  Brightness: {brightness}% | Exposure: {exposure.toFixed(2)} EV | Gamma: {gamma.toFixed(2)}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Crop Status</span>
                <span className="info-value">
                  {cropActive
                    ? `Active (${Math.round(cropWidth)} × ${Math.round(cropHeight)} px)`
                    : 'Full Image (Uncropped)'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Print Format</span>
                <span className="info-value">
                  {selectedIdSize} ID on {selectedPaperSize} Paper ({printLayoutInfo?.photoCount || 0} photos)
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Arrangement</span>
                <span className="info-value">
                  {printLayoutInfo?.columns || 0} × {printLayoutInfo?.rows || 0} grid (Margins: {printLayoutInfo?.marginHorizontalMm || 0} / {printLayoutInfo?.marginVerticalMm || 0} mm)
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Export Resolution</span>
                <span className="info-value">600 DPI (Ultra High Precision Lab Quality)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowInfoModal(false)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

