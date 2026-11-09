import React, { useRef, useEffect, useState, useCallback } from 'react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../../state/store';
import brandLogoUrl from '../../assets/GSpaceOne_PhotoID_Logo.png';

export const PrintPreview: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const previewData = useAppStore((state) => state.previewData);
  const imageDimensions = useAppStore((state) => state.imageDimensions);
  const selectedIdSize = useAppStore((state) => state.selectedIdSize);
  const selectedPaperSize = useAppStore((state) => state.selectedPaperSize);
  const printLayoutInfo = useAppStore((state) => state.printLayoutInfo);
  const showBrandLogo = useAppStore((state) => state.showBrandLogo);
  const setShowBrandLogo = useAppStore((state) => state.setShowBrandLogo);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const executePrint = useAppStore((state) => state.executePrint);
  const computeLayout = useAppStore((state) => state.computeLayout);
  const saveHighQualityImage = useAppStore((state) => state.saveHighQualityImage);
  const mainWorkspaceMode = useAppStore((state) => state.mainWorkspaceMode);
  const toggleWorkspaceMode = useAppStore((state) => state.toggleWorkspaceMode);
  const setWorkspaceMode = useAppStore((state) => state.setWorkspaceMode);
  const customPhotoCount = useAppStore((state) => state.customPhotoCount);
  const setCustomPhotoCount = useAppStore((state) => state.setCustomPhotoCount);

  // Preload official logo PNG
  useEffect(() => {
    const img = new Image();
    img.src = brandLogoUrl;
    img.onload = () => {
      logoImageRef.current = img;
    };
  }, []);

  const cropActive = useAppStore((state) => state.cropActive);
  const cropX = useAppStore((state) => state.cropX);
  const cropY = useAppStore((state) => state.cropY);
  const cropWidth = useAppStore((state) => state.cropWidth);
  const cropHeight = useAppStore((state) => state.cropHeight);

  // Recompute layout whenever sizes change
  useEffect(() => {
    computeLayout();
  }, [selectedIdSize, selectedPaperSize, computeLayout]);

  // Handle Save High Quality Image (600 DPI) for commercial photo lab printing
  const handleSaveHighQuality = useCallback(async () => {
    if (!previewData || isProcessing || isExporting) return;

    try {
      setIsExporting(true);
      setExportNotice(null);

      const sanitizedId = selectedIdSize.replace(/[^a-zA-Z0-9.]/g, '');
      const sanitizedPaper = selectedPaperSize.replace(/[^a-zA-Z0-9]/g, '');
      const defaultFileName = `GSpaceOne_PhotoID_${sanitizedId}_${sanitizedPaper}_600DPI.png`;

      const filePath = await saveDialog({
        title: 'Save Ultra High Quality Photo ID Sheet (600 DPI)',
        defaultPath: defaultFileName,
        filters: [
          { name: 'PNG Image (*.png)', extensions: ['png'] },
          { name: 'JPEG Image (*.jpg)', extensions: ['jpg', 'jpeg'] },
        ],
      });

      if (filePath) {
        await saveHighQualityImage(filePath);
        setExportNotice('Saved 600 DPI sheet successfully!');
        setTimeout(() => setExportNotice(null), 4000);
      }
    } catch (err) {
      console.error('Save high quality image failed:', err);
      setExportNotice('Export failed: ' + String(err));
    } finally {
      setIsExporting(false);
    }
  }, [previewData, isProcessing, isExporting, selectedIdSize, selectedPaperSize, saveHighQualityImage]);

  // Draw the miniature paper sheet and grid of ID photos
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !printLayoutInfo) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paperW_mm = printLayoutInfo.paperWidthMm || 101.6;
    const paperH_mm = printLayoutInfo.paperHeightMm || 152.4;

    // Set preview canvas pixel dimensions based on paper aspect ratio
    const maxDimension = 280;
    const paperAspect = paperW_mm / paperH_mm;
    let canvasW: number;
    let canvasH: number;

    if (paperAspect > 1) {
      canvasW = maxDimension;
      canvasH = Math.round(maxDimension / paperAspect);
    } else {
      canvasH = maxDimension;
      canvasW = Math.round(maxDimension * paperAspect);
    }

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Millimeter to preview canvas pixel ratio
    const mmToPx = canvasW / paperW_mm;

    // Draw White Paper Background with crisp border
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, canvasW, canvasH);

    // If we have an image, prepare to draw photos in grid cells
    const drawPhotos = (img?: HTMLImageElement) => {
      const {
        columns,
        rows,
        idWidthMm,
        idHeightMm,
        marginHorizontalMm,
        marginVerticalMm,
        spacingMm,
      } = printLayoutInfo;

      const cellW = idWidthMm * mmToPx;
      const cellH = idHeightMm * mmToPx;
      const spacing = spacingMm * mmToPx;
      const startX = marginHorizontalMm * mmToPx;
      const startY = marginVerticalMm * mmToPx;

      const totalSlots = columns * rows;
      const effectiveCount = customPhotoCount !== null ? Math.min(customPhotoCount, totalSlots) : totalSlots;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const slotIndex = r * columns + c;
          const posX = startX + c * (cellW + spacing);
          const posY = startY + r * (cellH + spacing);

          if (slotIndex < effectiveCount && img && img.naturalWidth > 0 && img.naturalHeight > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(posX, posY, cellW, cellH);
            ctx.clip();

            if (cropActive && cropWidth > 0 && cropHeight > 0) {
              const fullW = imageDimensions?.width || img.naturalWidth;
              const fullH = imageDimensions?.height || img.naturalHeight;
              const scaleX = img.naturalWidth / fullW;
              const scaleY = img.naturalHeight / fullH;

              const sx = Math.max(0, Math.min(img.naturalWidth - 1, cropX * scaleX));
              const sy = Math.max(0, Math.min(img.naturalHeight - 1, cropY * scaleY));
              const sw = Math.max(1, Math.min(img.naturalWidth - sx, cropWidth * scaleX));
              const sh = Math.max(1, Math.min(img.naturalHeight - sy, cropHeight * scaleY));

              ctx.drawImage(img, sx, sy, sw, sh, posX, posY, cellW, cellH);
            } else {
              ctx.drawImage(img, posX, posY, cellW, cellH);
            }
            ctx.restore();
          } else {
            // Placeholder empty photo box
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(posX, posY, cellW, cellH);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 0.75;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(posX, posY, cellW, cellH);
            ctx.setLineDash([]);
          }

          // L-shaped corner cut marks at the 4 corners of each photo cell
          const tick = Math.max(3, Math.round(5 * (canvasW / 300)));
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 0.75;

          // Top-Left corner
          ctx.beginPath();
          ctx.moveTo(posX - tick, posY);
          ctx.lineTo(posX, posY);
          ctx.lineTo(posX, posY - tick);
          ctx.stroke();

          // Top-Right corner
          ctx.beginPath();
          ctx.moveTo(posX + cellW + tick, posY);
          ctx.lineTo(posX + cellW, posY);
          ctx.lineTo(posX + cellW, posY - tick);
          ctx.stroke();

          // Bottom-Left corner
          ctx.beginPath();
          ctx.moveTo(posX - tick, posY + cellH);
          ctx.lineTo(posX, posY + cellH);
          ctx.lineTo(posX, posY + cellH + tick);
          ctx.stroke();

          // Bottom-Right corner
          ctx.beginPath();
          ctx.moveTo(posX + cellW + tick, posY + cellH);
          ctx.lineTo(posX + cellW, posY + cellH);
          ctx.lineTo(posX + cellW, posY + cellH + tick);
          ctx.stroke();
        }
      }

      // Draw official GSpaceOne PhotoID Brand Logo in safe margin space (never overlapping photos) if enabled
      if (showBrandLogo && logoImageRef.current) {
        const logoImg = logoImageRef.current;
        const aspect = (logoImg.naturalWidth || 1084) / (logoImg.naturalHeight || 291);
        const gridRight = startX + columns * cellW + (columns - 1) * spacing;
        const gridBottom = startY + rows * cellH + (rows - 1) * spacing;

        const bottomAvailable = canvasH - gridBottom;
        const rightAvailable = canvasW - gridRight;

        const desiredH = Math.min(22, Math.max(11, Math.round(bottomAvailable * 0.65)));
        const desiredW = Math.round(desiredH * aspect);

        if (bottomAvailable >= desiredH + 4) {
          // Bottom whitespace (centered)
          const logoX = (canvasW - desiredW) / 2;
          const logoY = gridBottom + (bottomAvailable - desiredH) / 2;
          ctx.drawImage(logoImg, logoX, logoY, desiredW, desiredH);
        } else if (rightAvailable >= desiredW + 4) {
          // Right margin whitespace
          const logoX = gridRight + (rightAvailable - desiredW) / 2;
          const logoY = (canvasH - desiredH) / 2;
          ctx.drawImage(logoImg, logoX, logoY, desiredW, desiredH);
        }
      }
    };

    if (previewData) {
      const img = new Image();
      img.onload = () => drawPhotos(img);
      img.src = previewData.startsWith('data:') ? previewData : `data:image/png;base64,${previewData}`;
    } else {
      drawPhotos();
    }
  }, [
    printLayoutInfo,
    previewData,
    imageDimensions,
    cropActive,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
  ]);

  const photoCount = printLayoutInfo?.photoCount || 0;

  return (
    <div className="side-panel">
      {/* Header with Swap View button */}
      <div className="side-panel-header">
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
            <path d="M6 9V2h12v7" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
          </svg>
          Print Layout Preview
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={toggleWorkspaceMode}
          title="Swap layout preview into large central workspace"
        >
          ⇄ Swap
        </button>
      </div>

      <div className="side-panel-body">
        {/* Layout Summary Badge */}
        {(() => {
          const maxPhotos = photoCount || 6;
          const effectiveCount = customPhotoCount !== null ? Math.min(customPhotoCount, maxPhotos) : maxPhotos;
          return (
            <div className="print-info-badge">
              {effectiveCount} of {maxPhotos} photos on {selectedPaperSize} paper
            </div>
          );
        })()}

        {/* Paper Sheet Preview Container (Click to expand to center workspace) */}
        <div
          className="print-preview-container"
          onClick={() => setWorkspaceMode('sheet')}
          title="Click to view full layout in center workspace"
          style={{ cursor: 'pointer' }}
        >
          <div className="print-sheet-wrapper">
            <canvas ref={canvasRef} className="print-sheet-canvas" />
          </div>
        </div>

        {/* Export Notification Message */}
        {exportNotice && (
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              backgroundColor: exportNotice.includes('fail')
                ? 'rgba(239, 68, 68, 0.15)'
                : 'rgba(16, 185, 129, 0.15)',
              color: exportNotice.includes('fail') ? '#ef4444' : '#10b981',
              border: `1px solid ${
                exportNotice.includes('fail') ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'
              }`,
              textAlign: 'center',
            }}
          >
            {exportNotice}
          </div>
        )}

        {/* Layout Specification Details */}
        <div className="print-meta-grid">
          <div className="meta-box">
            <span className="meta-box-label">Paper Size</span>
            <span className="meta-box-value">{selectedPaperSize}</span>
          </div>

          <div className="meta-box">
            <span className="meta-box-label">ID Size</span>
            <span className="meta-box-value">{selectedIdSize}</span>
          </div>

          <div className="meta-box">
            <span className="meta-box-label">Arrangement</span>
            <span className="meta-box-value">
              {printLayoutInfo?.columns || 0} × {printLayoutInfo?.rows || 0} grid
            </span>
          </div>

          <div className="meta-box">
            <span className="meta-box-label">Margins (H / V)</span>
            <span className="meta-box-value">
              {printLayoutInfo?.marginHorizontalMm || 0} / {printLayoutInfo?.marginVerticalMm || 0} mm
            </span>
          </div>
        </div>

        {/* Actions Container */}
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Custom Photo Count Stepper */}
          {(() => {
            const maxPhotos = photoCount || 6;
            const effectiveCount = customPhotoCount !== null ? Math.min(customPhotoCount, maxPhotos) : maxPhotos;
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Photos to Print:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', minWidth: '24px', height: '24px' }}
                    disabled={effectiveCount <= 1}
                    onClick={() => setCustomPhotoCount(Math.max(1, effectiveCount - 1))}
                    title="Decrease photo count"
                  >
                    -
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 600, minWidth: '40px', textAlign: 'center' }}>
                    {effectiveCount} / {maxPhotos}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 8px', minWidth: '24px', height: '24px' }}
                    disabled={effectiveCount >= maxPhotos}
                    onClick={() => setCustomPhotoCount(Math.min(maxPhotos, effectiveCount + 1))}
                    title="Increase photo count"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '2px 6px', fontSize: '10px', height: '24px' }}
                    onClick={() => setCustomPhotoCount(null)}
                    title="Fill all slots on sheet"
                  >
                    Max
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Brand Logo Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Brand Logo on Sheet:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-primary)', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={showBrandLogo}
                onChange={(e) => setShowBrandLogo(e.target.checked)}
                style={{ accentColor: 'var(--accent-light)', cursor: 'pointer' }}
              />
              {showBrandLogo ? 'Included' : 'Hidden'}
            </label>
          </div>

          {/* Swap Big Area View Button */}
          <button
            type="button"
            className="btn btn-secondary w-full"
            onClick={toggleWorkspaceMode}
            title="Swap big area between single photo and sheet view"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            {mainWorkspaceMode === 'sheet' ? 'Show Photo in Center' : 'Expand Sheet to Center'}
          </button>

          {/* Save High Quality for Photo Lab (600 DPI) */}
          <button
            type="button"
            className="btn btn-secondary w-full"
            disabled={!previewData || isProcessing || isExporting}
            onClick={handleSaveHighQuality}
            title="Export 600 DPI ultra-high-resolution sheet with crop marks and GSpaceOne logo for commercial photo printing lab"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {isExporting ? 'Exporting 600 DPI...' : 'Save for Lab (600 DPI)'}
          </button>

          {/* Direct Print Button */}
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!previewData || isProcessing}
            onClick={executePrint}
            title="Send photos to native OS print spooler"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect width="12" height="8" x="6" y="14" />
            </svg>
            {isProcessing
              ? 'Processing Print...'
              : `Print ${customPhotoCount !== null ? Math.min(customPhotoCount, photoCount || 6) : photoCount || 6} Photos`}
          </button>
        </div>
      </div>
    </div>
  );
};
