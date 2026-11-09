import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../state/store';
import brandLogoUrl from '../../assets/GSpaceOne_PhotoID_Logo.png';

interface PrinterListInfo {
  defaultPrinter: string;
  printers: string[];
}

export const PrintDialogModal: React.FC = () => {
  const showPrintModal = useAppStore((state) => state.showPrintModal);
  const setShowPrintModal = useAppStore((state) => state.setShowPrintModal);

  const previewData = useAppStore((state) => state.previewData);
  const imageDimensions = useAppStore((state) => state.imageDimensions);
  const selectedPaperSize = useAppStore((state) => state.selectedPaperSize);
  const selectedIdSize = useAppStore((state) => state.selectedIdSize);
  const printLayoutInfo = useAppStore((state) => state.printLayoutInfo);
  const customPhotoCount = useAppStore((state) => state.customPhotoCount);
  const setCustomPhotoCount = useAppStore((state) => state.setCustomPhotoCount);
  const currentGamma = useAppStore((state) => state.gamma);
  const brightness = useAppStore((state) => state.brightness);
  const exposure = useAppStore((state) => state.exposure);
  const showBrandLogo = useAppStore((state) => state.showBrandLogo);
  const setShowBrandLogo = useAppStore((state) => state.setShowBrandLogo);

  const cropActive = useAppStore((state) => state.cropActive);
  const cropX = useAppStore((state) => state.cropX);
  const cropY = useAppStore((state) => state.cropY);
  const cropWidth = useAppStore((state) => state.cropWidth);
  const cropHeight = useAppStore((state) => state.cropHeight);

  // Tab State: Printer | Layout | Caption | Header/Footer | Watermark
  const [activeTab, setActiveTab] = useState<'Printer' | 'Layout' | 'Caption' | 'Header/Footer' | 'Watermark'>('Layout');

  // Printer List & Selection State
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [isLoadingPrinters, setIsLoadingPrinters] = useState<boolean>(false);
  const [copies, setCopies] = useState<number>(1);
  const [colorMode, setColorMode] = useState<string>('Color');
  const [useSystemDialog, setUseSystemDialog] = useState<boolean>(false);

  // DPI Selection: 300 DPI (Standard) or 600 DPI (Lab Quality)
  const [dpi, setDpi] = useState<number>(300);

  // Layout Parameters (1.00 = 100% Exact True Physical Size)
  const [pageLayout, setPageLayout] = useState<string>('Single - Scale');
  const [xScale, setXScale] = useState<number>(1.0);
  const [yScale, setYScale] = useState<number>(1.0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);

  // Margins & Units
  const [marginLeft, setMarginLeft] = useState<number>(0.08);
  const [marginTop, setMarginTop] = useState<number>(0.08);
  const [marginRight, setMarginRight] = useState<number>(0.08);
  const [marginBottom, setMarginBottom] = useState<number>(0.08);
  const [marginUnit, setMarginUnit] = useState<'inch' | 'mm'>('inch');

  // Placement & Gamma
  const [position, setPosition] = useState<'Top-Right' | 'Center' | 'Top-Left' | 'Bottom-Left' | 'Bottom-Right'>('Top-Right');
  const [printGamma, setPrintGamma] = useState<number>(currentGamma || 0.8);

  // Print execution state
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printStatusMsg, setPrintStatusMsg] = useState<string | null>(null);

  // Canvas ref for live preview
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);

  // Preload brand logo
  useEffect(() => {
    const img = new Image();
    img.src = brandLogoUrl;
    img.onload = () => {
      logoImgRef.current = img;
    };
  }, []);

  // Fetch installed printers
  const fetchPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    try {
      const result = await invoke<PrinterListInfo>('get_printers');
      if (result && result.printers && result.printers.length > 0) {
        setPrinters(result.printers);
        setSelectedPrinter((prev) => (prev && result.printers.includes(prev) ? prev : result.defaultPrinter || result.printers[0]));
      } else {
        const fallback = ['System Default Printer', 'Microsoft Print to PDF'];
        setPrinters(fallback);
        setSelectedPrinter('System Default Printer');
      }
    } catch (err) {
      console.warn('Failed to query printers:', err);
      const fallback = ['System Default Printer', 'Microsoft Print to PDF'];
      setPrinters(fallback);
      setSelectedPrinter('System Default Printer');
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  // Sync initial state when modal opens
  useEffect(() => {
    if (showPrintModal) {
      fetchPrinters();
      setPrintGamma(currentGamma > 0 ? currentGamma : 0.8);
      setXScale(1.0);
      setYScale(1.0);
      setIsPrinting(false);
      setPrintStatusMsg(null);
    }
  }, [showPrintModal, currentGamma, fetchPrinters]);

  // Compute paper dimensions in inches and millimeters
  const paperW_mm = printLayoutInfo?.paperWidthMm || (selectedPaperSize === '4×6' ? 101.6 : selectedPaperSize === '5×7' ? 127.0 : 210.0);
  const paperH_mm = printLayoutInfo?.paperHeightMm || (selectedPaperSize === '4×6' ? 152.4 : selectedPaperSize === '5×7' ? 177.8 : 297.0);
  const paperW_in = (paperW_mm / 25.4).toFixed(2);
  const paperH_in = (paperH_mm / 25.4).toFixed(2);

  const idW_mm = printLayoutInfo?.idWidthMm || 35.0;
  const idH_mm = printLayoutInfo?.idHeightMm || 45.0;

  // Maximum calculated slots vs User-requested photo count
  const maxPhotos = printLayoutInfo?.photoCount || 6;
  const effectivePhotoCount = customPhotoCount !== null ? Math.min(customPhotoCount, maxPhotos) : maxPhotos;

  // Helper: Draw adjusted photo with color & custom print gamma
  const drawAdjustedPhoto = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      img: HTMLImageElement,
      dx: number,
      dy: number,
      dw: number,
      dh: number
    ) => {
      const fullW = imageDimensions?.width || img.naturalWidth;
      const fullH = imageDimensions?.height || img.naturalHeight;
      const scaleX = img.naturalWidth / fullW;
      const scaleY = img.naturalHeight / fullH;

      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;

      if (cropActive && cropWidth > 0 && cropHeight > 0) {
        sx = Math.max(0, Math.min(img.naturalWidth - 1, cropX * scaleX));
        sy = Math.max(0, Math.min(img.naturalHeight - 1, cropY * scaleY));
        sw = Math.max(1, Math.min(img.naturalWidth - sx, cropWidth * scaleX));
        sh = Math.max(1, Math.min(img.naturalHeight - sy, cropHeight * scaleY));
      }

      const offCanvas = document.createElement('canvas');
      offCanvas.width = Math.max(10, Math.round(dw));
      offCanvas.height = Math.max(10, Math.round(dh));
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) {
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
        return;
      }

      offCtx.drawImage(img, sx, sy, sw, sh, 0, 0, offCanvas.width, offCanvas.height);

      try {
        const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
        const data = imgData.data;
        const bFactor = (brightness / 100) * 255;
        const expFactor = Math.pow(2, exposure);
        const gammaExponent = 1.0 / Math.max(0.1, printGamma);

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          r = Math.min(255, Math.max(0, r * expFactor + bFactor));
          g = Math.min(255, Math.max(0, g * expFactor + bFactor));
          b = Math.min(255, Math.max(0, b * expFactor + bFactor));

          r = 255 * Math.pow(r / 255, gammaExponent);
          g = 255 * Math.pow(g / 255, gammaExponent);
          b = 255 * Math.pow(b / 255, gammaExponent);

          if (colorMode === 'Grayscale') {
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            r = gray;
            g = gray;
            b = gray;
          }

          data[i] = Math.min(255, Math.max(0, Math.round(r)));
          data[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
          data[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
        }
        offCtx.putImageData(imgData, 0, 0);
        ctx.drawImage(offCanvas, dx, dy, dw, dh);
      } catch {
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      }
    },
    [imageDimensions, cropActive, cropX, cropY, cropWidth, cropHeight, brightness, exposure, printGamma, colorMode]
  );

  // Render Live Preview Sheet with Dashed Margin Boundary & Exact Physical Grid
  useEffect(() => {
    if (!showPrintModal) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const previewW = 250;
    const paperAspect = paperW_mm / paperH_mm;
    const previewH = Math.round(previewW / paperAspect);

    canvas.width = previewW;
    canvas.height = previewH;

    // Background surround
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, previewW, previewH);

    // White Paper Sheet
    const sheetPad = 6;
    const sheetX = sheetPad;
    const sheetY = sheetPad;
    const sheetW = previewW - sheetPad * 2;
    const sheetH = previewH - sheetPad * 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sheetX, sheetY, sheetW, sheetH);

    const mmToSheetPx = sheetW / paperW_mm;

    // Margins converted to px
    const unitScale = marginUnit === 'inch' ? 25.4 : 1.0;
    const mLeftPx = marginLeft * unitScale * mmToSheetPx;
    const mTopPx = marginTop * unitScale * mmToSheetPx;
    const mRightPx = marginRight * unitScale * mmToSheetPx;
    const mBottomPx = marginBottom * unitScale * mmToSheetPx;

    // Dashed Printable Area Boundary
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const printAreaX = sheetX + mLeftPx;
    const printAreaY = sheetY + mTopPx;
    const printAreaW = Math.max(20, sheetW - mLeftPx - mRightPx);
    const printAreaH = Math.max(20, sheetH - mTopPx - mBottomPx);
    ctx.strokeRect(printAreaX, printAreaY, printAreaW, printAreaH);
    ctx.setLineDash([]);

    // Grid Layout parameters (1.00 = True 1:1 physical millimeter scale)
    const columns = printLayoutInfo?.columns || 2;
    const rows = printLayoutInfo?.rows || 3;
    const spacing_mm = printLayoutInfo?.spacingMm || 3.0;

    const cellW = idW_mm * mmToSheetPx * Math.max(0.1, xScale);
    const cellH = idH_mm * mmToSheetPx * Math.max(0.1, yScale);
    const spacing = spacing_mm * mmToSheetPx;

    const totalGridW = columns * cellW + (columns - 1) * spacing;
    const totalGridH = rows * cellH + (rows - 1) * spacing;

    let gridStartX: number;
    let gridStartY: number;

    switch (position) {
      case 'Top-Right':
        gridStartX = printAreaX + printAreaW - totalGridW;
        gridStartY = printAreaY;
        break;
      case 'Top-Left':
        gridStartX = printAreaX;
        gridStartY = printAreaY;
        break;
      case 'Bottom-Left':
        gridStartX = printAreaX;
        gridStartY = printAreaY + printAreaH - totalGridH;
        break;
      case 'Bottom-Right':
        gridStartX = printAreaX + printAreaW - totalGridW;
        gridStartY = printAreaY + printAreaH - totalGridH;
        break;
      case 'Center':
      default:
        gridStartX = printAreaX + (printAreaW - totalGridW) / 2;
        gridStartY = printAreaY + (printAreaH - totalGridH) / 2;
        break;
    }

    const drawContent = (img?: HTMLImageElement) => {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const slotIndex = r * columns + c;
          const posX = gridStartX + c * (cellW + spacing);
          const posY = gridStartY + r * (cellH + spacing);

          if (posX + cellW < sheetX || posX > sheetX + sheetW || posY + cellH < sheetY || posY > sheetY + sheetH) {
            continue;
          }

          if (slotIndex < effectivePhotoCount && img && img.naturalWidth > 0) {
            drawAdjustedPhoto(ctx, img, posX, posY, cellW, cellH);
          } else {
            // Unfilled slot placeholder
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(posX, posY, cellW, cellH);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 0.75;
            ctx.setLineDash([2, 2]);
            ctx.strokeRect(posX, posY, cellW, cellH);
            ctx.setLineDash([]);
          }

          // Cut marks
          const tick = 3;
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(posX - tick, posY); ctx.lineTo(posX, posY); ctx.lineTo(posX, posY - tick);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(posX + cellW + tick, posY); ctx.lineTo(posX + cellW, posY); ctx.lineTo(posX + cellW, posY - tick);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(posX - tick, posY + cellH); ctx.lineTo(posX, posY + cellH); ctx.lineTo(posX, posY + cellH + tick);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(posX + cellW + tick, posY + cellH); ctx.lineTo(posX + cellW, posY + cellH); ctx.lineTo(posX + cellW, posY + cellH + tick);
          ctx.stroke();
        }
      }

      // Safe Brand logo rendering
      if (showBrandLogo && logoImgRef.current) {
        const logoImg = logoImgRef.current;
        const aspect = (logoImg.naturalWidth || 1084) / (logoImg.naturalHeight || 291);
        const bottomAvail = sheetY + sheetH - (gridStartY + totalGridH);
        const desiredH = Math.min(16, Math.max(9, Math.round(bottomAvail * 0.6)));
        const desiredW = Math.round(desiredH * aspect);

        if (bottomAvail >= desiredH + 2) {
          const logoX = sheetX + (sheetW - desiredW) / 2;
          const logoY = gridStartY + totalGridH + (bottomAvail - desiredH) / 2;
          ctx.drawImage(logoImg, logoX, logoY, desiredW, desiredH);
        }
      }
    };

    if (previewData) {
      const img = new Image();
      img.onload = () => drawContent(img);
      img.src = previewData.startsWith('data:') ? previewData : `data:image/png;base64,${previewData}`;
    } else {
      drawContent();
    }
  }, [
    showPrintModal,
    previewData,
    paperW_mm,
    paperH_mm,
    idW_mm,
    idH_mm,
    marginLeft,
    marginTop,
    marginRight,
    marginBottom,
    marginUnit,
    position,
    xScale,
    yScale,
    effectivePhotoCount,
    printLayoutInfo,
    showBrandLogo,
    drawAdjustedPhoto,
  ]);

  // Execute actual printing with True Physical DPI & matching paper bounds
  const handleExecutePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setPrintStatusMsg(`Rendering ${effectivePhotoCount} photos at ${dpi} DPI...`);

    try {
      const printCanvas = document.createElement('canvas');
      const mmToPx = dpi / 25.4;
      const canvasW = Math.round(paperW_mm * mmToPx);
      const canvasH = Math.round(paperH_mm * mmToPx);

      printCanvas.width = canvasW;
      printCanvas.height = canvasH;
      const pCtx = printCanvas.getContext('2d');
      if (!pCtx) throw new Error('Could not initialize print canvas');

      // White paper sheet
      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, canvasW, canvasH);

      const unitScale = marginUnit === 'inch' ? 25.4 : 1.0;
      const mLeftPx = marginLeft * unitScale * mmToPx;
      const mTopPx = marginTop * unitScale * mmToPx;
      const mRightPx = marginRight * unitScale * mmToPx;
      const mBottomPx = marginBottom * unitScale * mmToPx;

      const printAreaX = mLeftPx;
      const printAreaY = mTopPx;
      const printAreaW = Math.max(50, canvasW - mLeftPx - mRightPx);
      const printAreaH = Math.max(50, canvasH - mTopPx - mBottomPx);

      const columns = printLayoutInfo?.columns || 2;
      const rows = printLayoutInfo?.rows || 3;
      const spacing_mm = printLayoutInfo?.spacingMm || 3.0;

      // 1:1 Physical dimensions based on DPI
      const cellW = idW_mm * mmToPx * Math.max(0.1, xScale);
      const cellH = idH_mm * mmToPx * Math.max(0.1, yScale);
      const spacing = spacing_mm * mmToPx;

      const totalGridW = columns * cellW + (columns - 1) * spacing;
      const totalGridH = rows * cellH + (rows - 1) * spacing;

      let gridStartX: number;
      let gridStartY: number;

      switch (position) {
        case 'Top-Right':
          gridStartX = printAreaX + printAreaW - totalGridW;
          gridStartY = printAreaY;
          break;
        case 'Top-Left':
          gridStartX = printAreaX;
          gridStartY = printAreaY;
          break;
        case 'Bottom-Left':
          gridStartX = printAreaX;
          gridStartY = printAreaY + printAreaH - totalGridH;
          break;
        case 'Bottom-Right':
          gridStartX = printAreaX + printAreaW - totalGridW;
          gridStartY = printAreaY + printAreaH - totalGridH;
          break;
        case 'Center':
        default:
          gridStartX = printAreaX + (printAreaW - totalGridW) / 2;
          gridStartY = printAreaY + (printAreaH - totalGridH) / 2;
          break;
      }

      if (previewData) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = previewData.startsWith('data:') ? previewData : `data:image/png;base64,${previewData}`;
        });

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < columns; c++) {
            const slotIndex = r * columns + c;
            const posX = gridStartX + c * (cellW + spacing);
            const posY = gridStartY + r * (cellH + spacing);

            // Only draw photo if within user-requested photo count
            if (slotIndex < effectivePhotoCount) {
              drawAdjustedPhoto(pCtx, img, posX, posY, cellW, cellH);

              // Precise Cut marks
              const tick = Math.round(18 * (dpi / 300));
              pCtx.strokeStyle = '#94a3b8';
              pCtx.lineWidth = 1;
              pCtx.beginPath();
              pCtx.moveTo(posX - tick, posY); pCtx.lineTo(posX, posY); pCtx.lineTo(posX, posY - tick);
              pCtx.stroke();
              pCtx.beginPath();
              pCtx.moveTo(posX + cellW + tick, posY); pCtx.lineTo(posX + cellW, posY); pCtx.lineTo(posX + cellW, posY - tick);
              pCtx.stroke();
              pCtx.beginPath();
              pCtx.moveTo(posX - tick, posY + cellH); pCtx.lineTo(posX, posY + cellH); ctxDrawLine(pCtx, posX, posY + cellH + tick);
              pCtx.stroke();
              pCtx.beginPath();
              pCtx.moveTo(posX + cellW + tick, posY + cellH); pCtx.lineTo(posX + cellW, posY + cellH); ctxDrawLine(pCtx, posX + cellW, posY + cellH + tick);
              pCtx.stroke();
            }
          }
        }
      }

      // Safe Brand logo rendering
      if (showBrandLogo && logoImgRef.current) {
        const logoImg = logoImgRef.current;
        const aspect = (logoImg.naturalWidth || 1084) / (logoImg.naturalHeight || 291);
        const bottomAvail = canvasH - (gridStartY + totalGridH);
        const desiredH = Math.min(80, Math.max(30, Math.round(bottomAvail * 0.6)));
        const desiredW = Math.round(desiredH * aspect);

        if (bottomAvail >= desiredH + 8) {
          const logoX = (canvasW - desiredW) / 2;
          const logoY = gridStartY + totalGridH + (bottomAvail - desiredH) / 2;
          pCtx.drawImage(logoImg, logoX, logoY, desiredW, desiredH);
        }
      }

      const sheetDataUrl = printCanvas.toDataURL('image/png');
      const isLandscape = paperW_mm > paperH_mm;

      if (useSystemDialog) {
        // Trigger browser / WebView print preview dialog
        const printIframe = document.createElement('iframe');
        printIframe.style.position = 'fixed';
        printIframe.style.right = '0';
        printIframe.style.bottom = '0';
        printIframe.style.width = '0';
        printIframe.style.height = '0';
        printIframe.style.border = '0';
        document.body.appendChild(printIframe);

        const frameDoc = printIframe.contentWindow?.document;
        if (!frameDoc) throw new Error('Could not access print frame');

        const pageOrientation = isLandscape ? 'landscape' : 'portrait';

        frameDoc.open();
        frameDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>GSpaceOne PhotoID Print</title>
              <style>
                @page {
                  size: ${paperW_in}in ${paperH_in}in ${pageOrientation};
                  margin: 0;
                }
                html, body {
                  margin: 0;
                  padding: 0;
                  width: 100%;
                  height: 100%;
                  background: #ffffff;
                  overflow: hidden;
                }
                img {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  display: block;
                }
              </style>
            </head>
            <body>
              <img src="${sheetDataUrl}" />
            </body>
          </html>
        `);
        frameDoc.close();

        setPrintStatusMsg('Opening system print preview...');

        setTimeout(() => {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();

          setTimeout(() => {
            try {
              document.body.removeChild(printIframe);
            } catch {}
            setIsPrinting(false);
            setShowPrintModal(false);
          }, 1200);
        }, 500);
      } else {
        // Direct spooling to selected printer via Tauri Rust command with physical paper calibration
        setPrintStatusMsg(`Sending to ${selectedPrinter || 'default printer'} (${paperW_in}×${paperH_in} in)...`);

        const resp = await invoke<string>('print_sheet_direct', {
          printerName: selectedPrinter || undefined,
          copies: copies,
          isLandscape: isLandscape,
          paperWidthIn: parseFloat(paperW_in),
          paperHeightIn: parseFloat(paperH_in),
          dpi: dpi,
          imageBase64: sheetDataUrl,
        });

        setPrintStatusMsg(resp || 'Print job queued successfully!');
        setTimeout(() => {
          setIsPrinting(false);
          setShowPrintModal(false);
        }, 1200);
      }
    } catch (err) {
      console.error('Print execution failed:', err);
      setPrintStatusMsg('Print error: ' + String(err));
      setIsPrinting(false);
    }
  };

  const ctxDrawLine = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.lineTo(x, y);
  };

  if (!showPrintModal) return null;

  return (
    <div className="print-modal-backdrop" onClick={() => setShowPrintModal(false)}>
      <div className="print-modal-window" onClick={(e) => e.stopPropagation()}>
        {/* Title Bar */}
        <div className="print-modal-titlebar">
          <span className="print-modal-title">Print Setup & Layout</span>
          <button
            type="button"
            className="print-modal-close"
            onClick={() => setShowPrintModal(false)}
            title="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Tab Header: Printer | Layout | Caption | Header/Footer | Watermark */}
        <div className="print-modal-tabs">
          {(['Printer', 'Layout', 'Caption', 'Header/Footer', 'Watermark'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`print-modal-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Main Content Area: Left Controls + Right Preview */}
        <div className="print-modal-content">
          {/* Left Column: Tab Panels */}
          <div className="print-modal-left">
            {activeTab === 'Layout' && (
              <div className="tab-pane-layout">
                {/* Photo Count & Layout Box */}
                <fieldset className="print-fieldset">
                  <legend className="print-legend">Photos on Sheet & Layout</legend>

                  <div className="print-form-row">
                    <select
                      className="print-select w-full"
                      value={pageLayout}
                      onChange={(e) => setPageLayout(e.target.value)}
                    >
                      <option value="Single - Scale">Single - Scale</option>
                      <option value="Fit to Page">Fit to Page</option>
                      <option value="Full Page Grid">Full Page Grid</option>
                    </select>
                  </div>

                  {/* Quantity Stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>
                      Photos to Print ({effectivePhotoCount} of {maxPhotos}):
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-page"
                        disabled={effectivePhotoCount <= 1}
                        onClick={() => setCustomPhotoCount(Math.max(1, effectivePhotoCount - 1))}
                        style={{ width: '26px', height: '24px' }}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={maxPhotos}
                        className="print-input-num"
                        style={{ width: '45px', textAlign: 'center' }}
                        value={effectivePhotoCount}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setCustomPhotoCount(isNaN(val) ? null : Math.max(1, Math.min(val, maxPhotos)));
                        }}
                      />
                      <button
                        type="button"
                        className="btn-page"
                        disabled={effectivePhotoCount >= maxPhotos}
                        onClick={() => setCustomPhotoCount(Math.min(maxPhotos, effectivePhotoCount + 1))}
                        style={{ width: '26px', height: '24px' }}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="btn-page"
                        onClick={() => setCustomPhotoCount(null)}
                        title="Fill all slots on sheet"
                        style={{ height: '24px', fontSize: '10px' }}
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  <div className="print-scale-grid" style={{ marginTop: '8px' }}>
                    <div className="print-scale-field">
                      <label>X Scale (1.00 = 100%)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.5"
                        max="2.0"
                        className="print-input-num"
                        value={xScale}
                        onChange={(e) => setXScale(parseFloat(e.target.value) || 1.0)}
                      />
                    </div>
                    <div className="print-scale-field">
                      <label>Y Scale (1.00 = 100%)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.5"
                        max="2.0"
                        className="print-input-num"
                        value={yScale}
                        onChange={(e) => setYScale(parseFloat(e.target.value) || 1.0)}
                      />
                    </div>
                  </div>

                  <div className="print-checkbox-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={autoRotate}
                        onChange={(e) => setAutoRotate(e.target.checked)}
                      />
                      Automatically rotate the picture (if needed)
                    </label>
                  </div>
                </fieldset>

                {/* Margins, Units, Position & Gamma Grid */}
                <div className="print-params-grid" style={{ marginTop: '10px' }}>
                  {/* Margins Fieldset */}
                  <fieldset className="print-fieldset print-margins-fieldset">
                    <legend className="print-legend">Margins</legend>
                    <div className="margins-inputs-grid">
                      <div className="margin-input-item">
                        <label>Left</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="print-input-num"
                          value={marginLeft}
                          onChange={(e) => setMarginLeft(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="margin-input-item">
                        <label>Top</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="print-input-num"
                          value={marginTop}
                          onChange={(e) => setMarginTop(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="margin-input-item">
                        <label>Right</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="print-input-num"
                          value={marginRight}
                          onChange={(e) => setMarginRight(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="margin-input-item">
                        <label>Bottom</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="print-input-num"
                          value={marginBottom}
                          onChange={(e) => setMarginBottom(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </fieldset>

                  {/* Units, Position, Gamma & Resolution */}
                  <div className="print-subcol">
                    <div className="print-param-group">
                      <label className="print-label">Units</label>
                      <select
                        className="print-select"
                        value={marginUnit}
                        onChange={(e) => setMarginUnit(e.target.value as 'inch' | 'mm')}
                      >
                        <option value="inch">inch</option>
                        <option value="mm">mm</option>
                      </select>
                    </div>

                    <div className="print-param-group">
                      <label className="print-label">Position</label>
                      <select
                        className="print-select"
                        value={position}
                        onChange={(e) => setPosition(e.target.value as any)}
                      >
                        <option value="Top-Right">Top-Right</option>
                        <option value="Center">Center</option>
                        <option value="Top-Left">Top-Left</option>
                        <option value="Bottom-Left">Bottom-Left</option>
                        <option value="Bottom-Right">Bottom-Right</option>
                      </select>
                    </div>

                    <div className="print-param-group">
                      <label className="print-label">Gamma</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        max="3.0"
                        className="print-input-num"
                        value={printGamma}
                        onChange={(e) => setPrintGamma(parseFloat(e.target.value) || 1.0)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Printer' && (
              <div className="tab-pane-printer">
                <fieldset className="print-fieldset">
                  <legend className="print-legend">Destination Printer</legend>
                  <div className="print-param-group mb-sm">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label className="print-label" style={{ margin: 0 }}>Printer Device</label>
                      <button
                        type="button"
                        onClick={fetchPrinters}
                        disabled={isLoadingPrinters}
                        title="Rescan installed printers"
                        style={{
                          fontSize: '11px',
                          color: '#2563eb',
                          cursor: 'pointer',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontWeight: 500,
                        }}
                      >
                        {isLoadingPrinters ? 'Scanning...' : '🔄 Rescan printers'}
                      </button>
                    </div>
                    <select
                      className="print-select w-full"
                      value={selectedPrinter}
                      onChange={(e) => setSelectedPrinter(e.target.value)}
                    >
                      {printers.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="printer-info-grid">
                    <div className="printer-info-row">
                      <span className="info-key">Paper:</span>
                      <span className="info-val">{selectedPaperSize} ({paperW_in} × {paperH_in} in, {paperW_mm.toFixed(1)} × {paperH_mm.toFixed(1)} mm)</span>
                    </div>
                    <div className="printer-info-row">
                      <span className="info-key">ID Size:</span>
                      <span className="info-val">{selectedIdSize} ({idW_mm.toFixed(1)} × {idH_mm.toFixed(1)} mm)</span>
                    </div>
                    <div className="printer-info-row">
                      <span className="info-key">Driver:</span>
                      <span className="info-val">Windows GDI / Raster Spooler (Direct 1:1 Scale)</span>
                    </div>
                  </div>
                </fieldset>

                <fieldset className="print-fieldset" style={{ marginTop: '10px' }}>
                  <legend className="print-legend">Print Quality & Options</legend>
                  <div className="print-grid-2col">
                    <div className="print-param-group">
                      <label className="print-label">Print Quality (DPI)</label>
                      <select
                        className="print-select"
                        value={dpi}
                        onChange={(e) => setDpi(parseInt(e.target.value, 10) || 300)}
                      >
                        <option value={300}>300 DPI (Standard High Quality)</option>
                        <option value={600}>600 DPI (Ultra-Sharp Photo Lab)</option>
                      </select>
                    </div>

                    <div className="print-param-group">
                      <label className="print-label">Copies</label>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        className="print-input-num"
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      />
                    </div>
                  </div>

                  <div className="print-grid-2col" style={{ marginTop: '8px' }}>
                    <div className="print-param-group">
                      <label className="print-label">Color Output</label>
                      <select
                        className="print-select"
                        value={colorMode}
                        onChange={(e) => setColorMode(e.target.value)}
                      >
                        <option value="Color">Color (Best Quality)</option>
                        <option value="Grayscale">Grayscale / Mono</option>
                      </select>
                    </div>
                  </div>

                  <div className="print-checkbox-row" style={{ marginTop: '8px' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={useSystemDialog}
                        onChange={(e) => setUseSystemDialog(e.target.checked)}
                      />
                      Open Windows Print Setup dialog on submit
                    </label>
                  </div>
                </fieldset>
              </div>
            )}

            {activeTab === 'Watermark' && (
              <div className="tab-pane-watermark">
                <fieldset className="print-fieldset">
                  <legend className="print-legend">Watermark & Brand Logo</legend>
                  <div className="print-checkbox-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={showBrandLogo}
                        onChange={(e) => setShowBrandLogo(e.target.checked)}
                      />
                      Include official GSpaceOne PhotoID Brand Logo on print sheet
                    </label>
                  </div>
                  <p style={{ color: '#6b7280', fontSize: '11px', marginTop: '8px' }}>
                    The brand logo is placed cleanly in bottom margin whitespace and never overlaps any ID photos.
                  </p>
                </fieldset>
              </div>
            )}

            {(activeTab === 'Caption' || activeTab === 'Header/Footer') && (
              <div className="tab-pane-generic">
                <fieldset className="print-fieldset">
                  <legend className="print-legend">{activeTab}</legend>
                  <p style={{ color: '#6b7280', fontSize: '12px' }}>
                    Standard photo ID layout active. No additional {activeTab.toLowerCase()} overlays enabled.
                  </p>
                </fieldset>
              </div>
            )}
          </div>

          {/* Right Column: Live Printable Preview */}
          <div className="print-modal-right">
            <span className="preview-label">Preview</span>
            <div className="preview-canvas-wrapper">
              <canvas ref={previewCanvasRef} className="preview-sheet-canvas" />
            </div>

            {/* Pagination Controls */}
            <div className="preview-pagination">
              <button type="button" className="btn-page" disabled>
                ◀
              </button>
              <span className="page-text">Page 1/1 ({effectivePhotoCount} photos)</span>
              <button type="button" className="btn-page" disabled>
                ▶
              </button>
            </div>

            {/* Page Size & Physical Photo Size Info */}
            <div className="preview-page-size">
              Sheet: {paperW_in} × {paperH_in} in ({paperW_mm.toFixed(1)} × {paperH_mm.toFixed(1)} mm)
            </div>
            <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, marginTop: '2px', textAlign: 'center' }}>
              True ID Size: {idW_mm.toFixed(1)} × {idH_mm.toFixed(1)} mm @ {dpi} DPI
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="print-modal-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-dialog-action btn-dialog-primary"
              onClick={handleExecutePrint}
              disabled={isPrinting || !previewData}
            >
              {isPrinting ? 'Printing...' : `Print ${effectivePhotoCount} Photos`}
            </button>
            {printStatusMsg && (
              <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 500 }}>
                {printStatusMsg}
              </span>
            )}
          </div>

          <button
            type="button"
            className="btn-dialog-action btn-dialog-secondary"
            onClick={() => setShowPrintModal(false)}
            disabled={isPrinting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
