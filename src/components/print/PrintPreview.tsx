import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../../state/store';

export const PrintPreview: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const previewData = useAppStore((state) => state.previewData);
  const selectedIdSize = useAppStore((state) => state.selectedIdSize);
  const selectedPaperSize = useAppStore((state) => state.selectedPaperSize);
  const printLayoutInfo = useAppStore((state) => state.printLayoutInfo);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const executePrint = useAppStore((state) => state.executePrint);
  const computeLayout = useAppStore((state) => state.computeLayout);

  const cropActive = useAppStore((state) => state.cropActive);
  const cropX = useAppStore((state) => state.cropX);
  const cropY = useAppStore((state) => state.cropY);
  const cropWidth = useAppStore((state) => state.cropWidth);
  const cropHeight = useAppStore((state) => state.cropHeight);

  // Recompute layout whenever sizes change
  useEffect(() => {
    computeLayout();
  }, [selectedIdSize, selectedPaperSize, computeLayout]);

  // Draw the miniature paper sheet and grid of ID photos
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !printLayoutInfo) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paperW_mm = printLayoutInfo.paperWidthMm;
    const paperH_mm = printLayoutInfo.paperHeightMm;

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

    // Draw White Paper Background with subtle border
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

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const posX = startX + c * (cellW + spacing);
          const posY = startY + r * (cellH + spacing);

          if (img) {
            // Draw image cropped or scaled to fit cell
            ctx.save();
            ctx.beginPath();
            ctx.rect(posX, posY, cellW, cellH);
            ctx.clip();

            if (cropActive && cropWidth > 0 && cropHeight > 0) {
              ctx.drawImage(
                img,
                cropX,
                cropY,
                cropWidth,
                cropHeight,
                posX,
                posY,
                cellW,
                cellH
              );
            } else {
              ctx.drawImage(img, posX, posY, cellW, cellH);
            }
            ctx.restore();
          } else {
            // Placeholder photo box
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(posX, posY, cellW, cellH);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Photo', posX + cellW / 2, posY + cellH / 2);
          }

          // Cutting guides / photo border
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(posX, posY, cellW, cellH);
          ctx.setLineDash([]);
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
  }, [printLayoutInfo, previewData, cropActive, cropX, cropY, cropWidth, cropHeight]);

  const photoCount = printLayoutInfo?.photoCount || 0;

  return (
    <div className="side-panel">
      {/* Header */}
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
      </div>

      <div className="side-panel-body">
        {/* Layout Summary Badge */}
        <div className="print-info-badge">
          {photoCount} {photoCount === 1 ? 'photo' : 'photos'} on {selectedPaperSize} paper
        </div>

        {/* Paper Sheet Preview Container */}
        <div className="print-preview-container">
          <div className="print-sheet-wrapper">
            <canvas ref={canvasRef} className="print-sheet-canvas" />
          </div>
        </div>

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

        {/* Print Execution Action */}
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-md)' }}>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!previewData || isProcessing}
            onClick={executePrint}
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
            {isProcessing ? 'Processing Print...' : `Print ${photoCount} Photos`}
          </button>
        </div>
      </div>
    </div>
  );
};
