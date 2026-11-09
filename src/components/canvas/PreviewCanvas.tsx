import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../state/store';
import brandLogoUrl from '../../assets/GSpaceOne_PhotoID_Logo.png';

interface DragHandle {
  id: 'nw' | 'ne' | 'se' | 'sw' | 'n' | 'e' | 's' | 'w' | 'move';
  cursor: string;
}

interface PreviewCanvasProps {
  onOpenImage?: () => void;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ onOpenImage }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const previewData = useAppStore((state) => state.previewData);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const imageDimensions = useAppStore((state) => state.imageDimensions);
  const setImageDimensions = useAppStore((state) => state.setImageDimensions);
  const setPreviewData = useAppStore((state) => state.setPreviewData);

  const cropActive = useAppStore((state) => state.cropActive);
  const cropX = useAppStore((state) => state.cropX);
  const cropY = useAppStore((state) => state.cropY);
  const cropWidth = useAppStore((state) => state.cropWidth);
  const cropHeight = useAppStore((state) => state.cropHeight);
  const setCrop = useAppStore((state) => state.setCrop);

  const printLayoutInfo = useAppStore((state) => state.printLayoutInfo);
  const selectedPaperSize = useAppStore((state) => state.selectedPaperSize);
  const selectedIdSize = useAppStore((state) => state.selectedIdSize);
  const mainWorkspaceMode = useAppStore((state) => state.mainWorkspaceMode);
  const toggleWorkspaceMode = useAppStore((state) => state.toggleWorkspaceMode);
  const showBrandLogo = useAppStore((state) => state.showBrandLogo);
  const customPhotoCount = useAppStore((state) => state.customPhotoCount);
  const loadImage = useAppStore((state) => state.loadImage);

  // Viewport transformation: scale and offset
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Loaded Image Objects
  const imageRef = useRef<HTMLImageElement | null>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);

  // Load the official GSpaceOne PhotoID brand logo once
  useEffect(() => {
    const img = new Image();
    img.src = brandLogoUrl;
    img.onload = () => {
      logoImageRef.current = img;
    };
  }, []);

  // Register native Tauri Drag & Drop listener for files dragged from Windows Explorer
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isMounted = true;

    const setupTauriDragDrop = async () => {
      try {
        const isTauri =
          typeof window !== 'undefined' &&
          ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
        if (!isTauri) return;

        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        unlisten = await win.onDragDropEvent((event) => {
          if (!isMounted) return;
          if (event.payload.type === 'over') {
            setIsDragOver(true);
          } else if (event.payload.type === 'drop') {
            setIsDragOver(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const filePath = paths[0];
              const lower = filePath.toLowerCase();
              if (
                ['.png', '.jpg', '.jpeg', '.webp', '.tiff', '.bmp'].some((ext) =>
                  lower.endsWith(ext)
                )
              ) {
                loadImage(filePath);
              }
            }
          } else {
            setIsDragOver(false);
          }
        });
      } catch (err) {
        console.warn('onDragDropEvent registration failed:', err);
      }
    };

    setupTauriDragDrop();

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [loadImage]);

  // Interaction State
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const activeHandleRef = useRef<DragHandle['id'] | null>(null);
  const cropDragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    initialCrop: { x: number; y: number; w: number; h: number };
  }>({
    mouseX: 0,
    mouseY: 0,
    initialCrop: { x: 0, y: 0, w: 0, h: 0 },
  });

  const [activeCursor, setActiveCursor] = useState<string>('default');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Request Animation Frame handle
  const animationFrameRef = useRef<number | null>(null);

  // Convert client mouse coordinates to Canvas coordinates
  const getCanvasCoordinates = useCallback((e: MouseEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // Convert Image coordinates to Canvas coordinate space
  const imageToCanvas = useCallback(
    (imgX: number, imgY: number) => {
      const canvasX = imgX * scale + offset.x;
      const canvasY = imgY * scale + offset.y;
      return { x: canvasX, y: canvasY };
    },
    [offset, scale]
  );

  // Convert Canvas coordinate back to Image space
  const canvasToImage = useCallback(
    (canvasX: number, canvasY: number) => {
      const imgX = (canvasX - offset.x) / scale;
      const imgY = (canvasY - offset.y) / scale;
      return { x: imgX, y: imgY };
    },
    [offset, scale]
  );

  // Auto-fit image to container viewport
  const fitImageToContainer = useCallback((imgWidth: number, imgHeight: number) => {
    const container = containerRef.current;
    if (!container || imgWidth <= 0 || imgHeight <= 0) return;

    const contW = Math.max(100, container.clientWidth - 40);
    const contH = Math.max(100, container.clientHeight - 40);

    const scaleW = contW / imgWidth;
    const scaleH = contH / imgHeight;
    const initialScale = Math.min(scaleW, scaleH, 1.0);

    const initialOffsetX = (container.clientWidth - imgWidth * initialScale) / 2;
    const initialOffsetY = (container.clientHeight - imgHeight * initialScale) / 2;

    setScale(initialScale);
    setOffset({ x: initialOffsetX, y: initialOffsetY });
  }, []);

  // Load preview data into HTMLImageElement
  useEffect(() => {
    if (!previewData) {
      imageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!imageDimensions || imageDimensions.width !== w || imageDimensions.height !== h) {
        setImageDimensions(w, h);
      }
      fitImageToContainer(w, h);
    };
    img.src = previewData.startsWith('data:') ? previewData : `data:image/png;base64,${previewData}`;
  }, [previewData, setImageDimensions, fitImageToContainer]);

  // Robust ResizeObserver: synchronizes canvas buffer dimensions to container at all times
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      if (canvas && container) {
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
        }
      }
    };

    updateCanvasSize();

    const ro = new ResizeObserver(() => {
      updateCanvasSize();
    });
    ro.observe(container);

    return () => ro.disconnect();
  }, [previewData]);

  // Main Render Loop with requestAnimationFrame
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Safety check to ensure buffer is always in sync with DOM container
    if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const img = imageRef.current;
    if (!img) return;

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;

    ctx.save();

    // ─────────────────────────────────────────────────────────────
    // MODE A: FULL PRINT SHEET VIEW IN LARGE WORKSPACE
    // ─────────────────────────────────────────────────────────────
    if (mainWorkspaceMode === 'sheet' && printLayoutInfo) {
      const paperW_mm = printLayoutInfo.paperWidthMm || 101.6;
      const paperH_mm = printLayoutInfo.paperHeightMm || 152.4;

      // Base paper size in canvas units
      const baseSheetW = Math.min(canvas.width * 0.82, canvas.height * 0.82 * (paperW_mm / paperH_mm));
      const sheetW = baseSheetW * scale;
      const sheetH = (sheetW / (paperW_mm / paperH_mm));

      const sheetX = offset.x + (canvas.width - sheetW) / 2;
      const sheetY = offset.y + (canvas.height - sheetH) / 2;

      // Drop shadow for paper sheet
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;

      // Draw white paper sheet
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sheetX, sheetY, sheetW, sheetH);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Subtle sheet border
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.strokeRect(sheetX, sheetY, sheetW, sheetH);

      // Millimeter to pixel scale factor on sheet
      const mmToSheetPx = sheetW / paperW_mm;

      const {
        columns,
        rows,
        idWidthMm,
        idHeightMm,
        marginHorizontalMm,
        marginVerticalMm,
        spacingMm,
      } = printLayoutInfo;

      const cellW = idWidthMm * mmToSheetPx;
      const cellH = idHeightMm * mmToSheetPx;
      const spacing = spacingMm * mmToSheetPx;
      const startX = sheetX + marginHorizontalMm * mmToSheetPx;
      const startY = sheetY + marginVerticalMm * mmToSheetPx;

      const totalSlots = columns * rows;
      const effectiveCount = customPhotoCount !== null ? Math.min(customPhotoCount, totalSlots) : totalSlots;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
          const slotIndex = r * columns + c;
          const posX = startX + c * (cellW + spacing);
          const posY = startY + r * (cellH + spacing);

          if (slotIndex < effectiveCount) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(posX, posY, cellW, cellH);
            ctx.clip();

            if (cropActive && cropWidth > 0 && cropHeight > 0) {
              const scaleX = imgW / (imageDimensions?.width || imgW);
              const scaleY = imgH / (imageDimensions?.height || imgH);
              const sx = Math.max(0, Math.min(imgW - 1, cropX * scaleX));
              const sy = Math.max(0, Math.min(imgH - 1, cropY * scaleY));
              const sw = Math.max(1, Math.min(imgW - sx, cropWidth * scaleX));
              const sh = Math.max(1, Math.min(imgH - sy, cropHeight * scaleY));

              ctx.drawImage(img, sx, sy, sw, sh, posX, posY, cellW, cellH);
            } else {
              ctx.drawImage(img, posX, posY, cellW, cellH);
            }
            ctx.restore();
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

          // L-shaped corner cut marks at 4 corners
          const tick = Math.max(4, Math.round(6 * (cellW / 120)));
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;

          // Top-Left
          ctx.beginPath();
          ctx.moveTo(posX - tick, posY); ctx.lineTo(posX, posY); ctx.lineTo(posX, posY - tick);
          ctx.stroke();
          // Top-Right
          ctx.beginPath();
          ctx.moveTo(posX + cellW + tick, posY); ctx.lineTo(posX + cellW, posY); ctx.lineTo(posX + cellW, posY - tick);
          ctx.stroke();
          // Bottom-Left
          ctx.beginPath();
          ctx.moveTo(posX - tick, posY + cellH); ctx.lineTo(posX, posY + cellH); ctx.lineTo(posX, posY + cellH + tick);
          ctx.stroke();
          // Bottom-Right
          ctx.beginPath();
          ctx.moveTo(posX + cellW + tick, posY + cellH); ctx.lineTo(posX + cellW, posY + cellH); ctx.lineTo(posX + cellW, posY + cellH + tick);
          ctx.stroke();
        }
      }

      // Draw official GSpaceOne PhotoID Brand Logo in safe margin space if enabled (never overlapping photos)
      if (showBrandLogo && logoImageRef.current) {
        const logoImg = logoImageRef.current;
        const aspect = (logoImg.naturalWidth || 1084) / (logoImg.naturalHeight || 291);

        const gridRight = startX + columns * cellW + (columns - 1) * spacing;
        const gridBottom = startY + rows * cellH + (rows - 1) * spacing;

        const bottomAvailable = (sheetY + sheetH) - gridBottom;
        const rightAvailable = (sheetX + sheetW) - gridRight;

        const desiredH = Math.min(32, Math.max(14, Math.round(bottomAvailable * 0.65)));
        const desiredW = Math.round(desiredH * aspect);

        if (bottomAvailable >= desiredH + 6) {
          // Centered in safe bottom margin whitespace
          const logoX = sheetX + (sheetW - desiredW) / 2;
          const logoY = gridBottom + (bottomAvailable - desiredH) / 2;
          ctx.drawImage(logoImg, logoX, logoY, desiredW, desiredH);
        } else if (rightAvailable >= desiredW + 8) {
          // Centered in safe right margin whitespace
          const logoX = gridRight + (rightAvailable - desiredW) / 2;
          const logoY = sheetY + (sheetH - desiredH) / 2;
          ctx.drawImage(logoImg, logoX, logoY, desiredW, desiredH);
        }
      }

      ctx.restore();
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // MODE B: SINGLE PHOTO EDITOR VIEW (DEFAULT)
    // ─────────────────────────────────────────────────────────────
    const imgDrawX = offset.x;
    const imgDrawY = offset.y;
    const imgDrawW = imgW * scale;
    const imgDrawH = imgH * scale;

    // Draw main image
    ctx.drawImage(img, imgDrawX, imgDrawY, imgDrawW, imgDrawH);

    // If Crop is Active, Draw Shaded Cutout & 8 Handles
    if (cropActive && cropWidth > 0 && cropHeight > 0) {
      const cropP1 = imageToCanvas(cropX, cropY);
      const cropP2 = imageToCanvas(cropX + cropWidth, cropY + cropHeight);

      const cX = Math.min(cropP1.x, cropP2.x);
      const cY = Math.min(cropP1.y, cropP2.y);
      const cW = Math.abs(cropP2.x - cropP1.x);
      const cH = Math.abs(cropP2.y - cropP1.y);

      // Shaded overlay outside crop box using 4 clean rectangular strips (bug-free)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      // Top strip
      if (cY > 0) ctx.fillRect(0, 0, canvas.width, cY);
      // Bottom strip
      if (cY + cH < canvas.height) ctx.fillRect(0, cY + cH, canvas.width, canvas.height - (cY + cH));
      // Left strip
      if (cX > 0) ctx.fillRect(0, cY, cX, cH);
      // Right strip
      if (cX + cW < canvas.width) ctx.fillRect(cX + cW, cY, canvas.width - (cX + cW), cH);

      // Crop border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cX, cY, cW, cH);

      // Rule of thirds grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cX + cW / 3, cY); ctx.lineTo(cX + cW / 3, cY + cH);
      ctx.moveTo(cX + (2 * cW) / 3, cY); ctx.lineTo(cX + (2 * cW) / 3, cY + cH);
      ctx.moveTo(cX, cY + cH / 3); ctx.lineTo(cX + cW, cY + cH / 3);
      ctx.moveTo(cX, cY + (2 * cH) / 3); ctx.lineTo(cX + cW, cY + (2 * cH) / 3);
      ctx.stroke();

      // Crop Corner and Edge Handles
      const handleSize = 9;
      ctx.fillStyle = '#e12d4d';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      const drawHandle = (x: number, y: number) => {
        ctx.beginPath();
        ctx.rect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
        ctx.fill();
        ctx.stroke();
      };

      // 4 corners
      drawHandle(cX, cY); // NW
      drawHandle(cX + cW, cY); // NE
      drawHandle(cX + cW, cY + cH); // SE
      drawHandle(cX, cY + cH); // SW

      // 4 edges
      drawHandle(cX + cW / 2, cY); // N
      drawHandle(cX + cW, cY + cH / 2); // E
      drawHandle(cX + cW / 2, cY + cH); // S
      drawHandle(cX, cY + cH / 2); // W
    }

    ctx.restore();
  }, [
    offset,
    scale,
    cropActive,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    imageToCanvas,
    mainWorkspaceMode,
    printLayoutInfo,
    imageDimensions,
  ]);

  // Schedule render via RAF
  useEffect(() => {
    const loop = () => {
      render();
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);

  // Determine which handle is under cursor
  const getHandleAtPosition = useCallback(
    (canvasX: number, canvasY: number): DragHandle['id'] | null => {
      if (!cropActive || cropWidth <= 0 || cropHeight <= 0) return null;

      const p1 = imageToCanvas(cropX, cropY);
      const p2 = imageToCanvas(cropX + cropWidth, cropY + cropHeight);

      const cX = Math.min(p1.x, p2.x);
      const cY = Math.min(p1.y, p2.y);
      const cW = Math.abs(p2.x - p1.x);
      const cH = Math.abs(p2.y - p1.y);

      const tolerance = 10;
      const near = (x: number, y: number) =>
        Math.abs(canvasX - x) <= tolerance && Math.abs(canvasY - y) <= tolerance;

      if (near(cX, cY)) return 'nw';
      if (near(cX + cW, cY)) return 'ne';
      if (near(cX + cW, cY + cH)) return 'se';
      if (near(cX, cY + cH)) return 'sw';

      if (near(cX + cW / 2, cY)) return 'n';
      if (near(cX + cW, cY + cH / 2)) return 'e';
      if (near(cX + cW / 2, cY + cH)) return 's';
      if (near(cX, cY + cH / 2)) return 'w';

      // Inside crop rect: Move
      if (canvasX >= cX && canvasX <= cX + cW && canvasY >= cY && canvasY <= cY + cH) {
        return 'move';
      }

      return null;
    },
    [cropActive, cropX, cropY, cropWidth, cropHeight, imageToCanvas]
  );

  // Mouse Wheel: Zoom centered at mouse pointer
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!imageRef.current && mainWorkspaceMode !== 'sheet') return;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(0.05, scale * zoomFactor), 15);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Adjust offset to zoom centered at cursor
    const newOffsetX = mouseX - (mouseX - offset.x) * (newScale / scale);
    const newOffsetY = mouseY - (mouseY - offset.y) * (newScale / scale);

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // Mouse Down
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageRef.current) return;

    const { x, y } = getCanvasCoordinates(e);

    // If in single photo mode with active crop, check crop handles
    if (mainWorkspaceMode === 'editor' && cropActive) {
      const handle = getHandleAtPosition(x, y);
      if (handle) {
        activeHandleRef.current = handle;
        cropDragStartRef.current = {
          mouseX: x,
          mouseY: y,
          initialCrop: { x: cropX, y: cropY, w: cropWidth, h: cropHeight },
        };
        return;
      }
    }

    // Otherwise initiate canvas panning
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoordinates(e);

    // Update cursor style
    if (!isPanningRef.current && !activeHandleRef.current) {
      if (mainWorkspaceMode === 'editor' && cropActive) {
        const handle = getHandleAtPosition(x, y);
        if (handle) {
          const cursors: Record<string, string> = {
            nw: 'nwse-resize',
            ne: 'nesw-resize',
            se: 'nwse-resize',
            sw: 'nesw-resize',
            n: 'ns-resize',
            e: 'ew-resize',
            s: 'ns-resize',
            w: 'ew-resize',
            move: 'move',
          };
          setActiveCursor(cursors[handle] || 'default');
          return;
        }
      }
      setActiveCursor(isPanningRef.current ? 'grabbing' : 'default');
    }

    // Handle Active Crop Dragging
    if (activeHandleRef.current) {
      const handle = activeHandleRef.current;
      const { initialCrop } = cropDragStartRef.current;
      const curImgCoord = canvasToImage(x, y);
      const startImgCoord = canvasToImage(
        cropDragStartRef.current.mouseX,
        cropDragStartRef.current.mouseY
      );

      const deltaX = curImgCoord.x - startImgCoord.x;
      const deltaY = curImgCoord.y - startImgCoord.y;

      const imgW = imageDimensions?.width || 4000;
      const imgH = imageDimensions?.height || 4000;

      let newX = initialCrop.x;
      let newY = initialCrop.y;
      let newW = initialCrop.w;
      let newH = initialCrop.h;

      if (handle === 'move') {
        newX = Math.max(0, Math.min(imgW - initialCrop.w, initialCrop.x + deltaX));
        newY = Math.max(0, Math.min(imgH - initialCrop.h, initialCrop.y + deltaY));
      } else {
        if (handle.includes('w')) {
          const maxLeftDelta = initialCrop.w - 20;
          const actualDeltaX = Math.min(maxLeftDelta, deltaX);
          newX = Math.max(0, initialCrop.x + actualDeltaX);
          newW = initialCrop.w - (newX - initialCrop.x);
        }
        if (handle.includes('e')) {
          newW = Math.max(20, Math.min(imgW - initialCrop.x, initialCrop.w + deltaX));
        }
        if (handle.includes('n')) {
          const maxTopDelta = initialCrop.h - 20;
          const actualDeltaY = Math.min(maxTopDelta, deltaY);
          newY = Math.max(0, initialCrop.y + actualDeltaY);
          newH = initialCrop.h - (newY - initialCrop.y);
        }
        if (handle.includes('s')) {
          newH = Math.max(20, Math.min(imgH - initialCrop.y, initialCrop.h + deltaY));
        }
      }

      setCrop(newX, newY, newW, newH);
      return;
    }

    // Handle Panning
    if (isPanningRef.current) {
      setOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    isPanningRef.current = false;
    activeHandleRef.current = null;
  };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setPreviewData(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {previewData ? (
        <>
          <canvas
            ref={canvasRef}
            className={`preview-canvas ${cropActive ? 'crop-active' : ''}`}
            style={{ cursor: activeCursor }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />

          {/* Floating View Mode Switcher: Swap between Single Photo and Print Sheet */}
          <div className="canvas-view-switcher">
            <button
              type="button"
              className="btn btn-secondary canvas-view-toggle"
              onClick={toggleWorkspaceMode}
              title="Swap between Single Photo editing and Full Print Sheet preview"
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
              {mainWorkspaceMode === 'sheet'
                ? '⇄ Switch to Single Photo Edit'
                : '⇄ Switch to Full Sheet View'}
            </button>
          </div>

          {/* Status info overlay */}
          <div className="canvas-status-bar">
            <span className="canvas-status-item">
              Mode: <strong>{mainWorkspaceMode === 'sheet' ? 'Print Sheet' : 'Single Photo'}</strong>
            </span>
            <span className="canvas-status-item">
              Zoom: <strong>{Math.round(scale * 100)}%</strong>
            </span>
            {imageDimensions && (
              <span className="canvas-status-item">
                Size: {imageDimensions.width} × {imageDimensions.height} px
              </span>
            )}
            {cropActive && cropWidth > 0 && mainWorkspaceMode === 'editor' && (
              <span className="canvas-status-item">
                Crop: {Math.round(cropWidth)} × {Math.round(cropHeight)} px
              </span>
            )}
            {mainWorkspaceMode === 'sheet' && printLayoutInfo && (
              <span className="canvas-status-item">
                Layout: {printLayoutInfo.photoCount} photos on {selectedPaperSize} ({selectedIdSize})
              </span>
            )}
          </div>
        </>
      ) : (
        <div
          className={`empty-state ${isDragOver ? 'drag-over' : ''}`}
        >
          <svg
            className="empty-state-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <h3 className="empty-state-title">Drop or Open an image to begin</h3>
          <p className="empty-state-desc">
            Supports JPEG, PNG, WEBP, and TIFF. Real-time GPU/CPU pipeline ready.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              onOpenImage?.();
            }}
          >
            Select Image File
          </button>
        </div>
      )}

      {/* Non-blocking Compact Processing Pill Toast */}
      {isProcessing && (
        <div className="processing-pill">
          <div className="spinner-sm" />
          <span>Processing...</span>
        </div>
      )}
    </div>
  );
};
