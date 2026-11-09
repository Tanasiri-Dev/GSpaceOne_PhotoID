import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../state/store';

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

  // Viewport transformation: scale and offset
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Loaded Image Object
  const imageRef = useRef<HTMLImageElement | null>(null);

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

  // Load preview data into HTMLImageElement
  useEffect(() => {
    if (!previewData) {
      imageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      if (!imageDimensions || imageDimensions.width !== img.width || imageDimensions.height !== img.height) {
        setImageDimensions(img.width, img.height);
      }
      fitImageToContainer(img.width, img.height);
    };
    img.src = previewData.startsWith('data:') ? previewData : `data:image/png;base64,${previewData}`;
  }, [previewData]);

  // Auto-fit image to container viewport
  const fitImageToContainer = useCallback((imgWidth: number, imgHeight: number) => {
    const container = containerRef.current;
    if (!container || imgWidth === 0 || imgHeight === 0) return;

    const contW = container.clientWidth - 40;
    const contH = container.clientHeight - 40;

    const scaleW = contW / imgWidth;
    const scaleH = contH / imgHeight;
    const initialScale = Math.min(scaleW, scaleH, 1.0);

    const initialOffsetX = (container.clientWidth - imgWidth * initialScale) / 2;
    const initialOffsetY = (container.clientHeight - imgHeight * initialScale) / 2;

    setScale(initialScale);
    setOffset({ x: initialOffsetX, y: initialOffsetY });
  }, []);

  // Handle Resize of Container
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Main Render Loop with requestAnimationFrame
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const img = imageRef.current;
    if (!img) return;

    ctx.save();

    // Draw the main image
    const imgDrawX = offset.x;
    const imgDrawY = offset.y;
    const imgDrawW = img.width * scale;
    const imgDrawH = img.height * scale;

    ctx.drawImage(img, imgDrawX, imgDrawY, imgDrawW, imgDrawH);

    // If Crop is Active, Draw Crop Overlay
    if (cropActive && cropWidth > 0 && cropHeight > 0) {
      const cropP1 = imageToCanvas(cropX, cropY);
      const cropP2 = imageToCanvas(cropX + cropWidth, cropY + cropHeight);

      const cX = Math.min(cropP1.x, cropP2.x);
      const cY = Math.min(cropP1.y, cropP2.y);
      const cW = Math.abs(cropP2.x - cropP1.x);
      const cH = Math.abs(cropP2.y - cropP1.y);

      // Semi-transparent dark overlay outside crop region
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      // Outer rect
      ctx.rect(0, 0, canvas.width, canvas.height);
      // Cutout inner crop rect
      ctx.rect(cX, cY + cH, cW, -cH);
      ctx.fill();

      // Crop border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cX, cY, cW, cH);

      // Rule of thirds grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Vertical thirds
      ctx.moveTo(cX + cW / 3, cY);
      ctx.lineTo(cX + cW / 3, cY + cH);
      ctx.moveTo(cX + (2 * cW) / 3, cY);
      ctx.lineTo(cX + (2 * cW) / 3, cY + cH);
      // Horizontal thirds
      ctx.moveTo(cX, cY + cH / 3);
      ctx.lineTo(cX + cW, cY + cH / 3);
      ctx.moveTo(cX, cY + (2 * cH) / 3);
      ctx.lineTo(cX + cW, cY + (2 * cH) / 3);
      ctx.stroke();

      // Crop Corner and Edge Handles
      const handleSize = 8;
      ctx.fillStyle = '#e94560';
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
  }, [offset, scale, cropActive, cropX, cropY, cropWidth, cropHeight, imageToCanvas]);

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
    if (!imageRef.current) return;

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
    const handle = getHandleAtPosition(x, y);

    if (cropActive && handle) {
      activeHandleRef.current = handle;
      cropDragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        initialCrop: { x: cropX, y: cropY, w: cropWidth, h: cropHeight },
      };
    } else {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      };
      setActiveCursor('grabbing');
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageRef.current) return;

    const { x, y } = getCanvasCoordinates(e);

    // If dragging crop handle or moving crop box
    if (activeHandleRef.current) {
      const deltaX = (e.clientX - cropDragStartRef.current.mouseX) / scale;
      const deltaY = (e.clientY - cropDragStartRef.current.mouseY) / scale;
      const { initialCrop } = cropDragStartRef.current;
      const imgW = imageDimensions?.width || 2000;
      const imgH = imageDimensions?.height || 2000;

      let newX = initialCrop.x;
      let newY = initialCrop.y;
      let newW = initialCrop.w;
      let newH = initialCrop.h;

      switch (activeHandleRef.current) {
        case 'move':
          newX = Math.max(0, Math.min(imgW - initialCrop.w, initialCrop.x + deltaX));
          newY = Math.max(0, Math.min(imgH - initialCrop.h, initialCrop.y + deltaY));
          break;
        case 'se':
          newW = Math.max(20, Math.min(imgW - initialCrop.x, initialCrop.w + deltaX));
          newH = Math.max(20, Math.min(imgH - initialCrop.y, initialCrop.h + deltaY));
          break;
        case 'nw':
          newX = Math.max(0, initialCrop.x + deltaX);
          newY = Math.max(0, initialCrop.y + deltaY);
          newW = initialCrop.w - (newX - initialCrop.x);
          newH = initialCrop.h - (newY - initialCrop.y);
          break;
        case 'ne':
          newY = Math.max(0, initialCrop.y + deltaY);
          newW = Math.max(20, Math.min(imgW - initialCrop.x, initialCrop.w + deltaX));
          newH = initialCrop.h - (newY - initialCrop.y);
          break;
        case 'sw':
          newX = Math.max(0, initialCrop.x + deltaX);
          newW = initialCrop.w - (newX - initialCrop.x);
          newH = Math.max(20, Math.min(imgH - initialCrop.y, initialCrop.h + deltaY));
          break;
        case 'e':
          newW = Math.max(20, Math.min(imgW - initialCrop.x, initialCrop.w + deltaX));
          break;
        case 's':
          newH = Math.max(20, Math.min(imgH - initialCrop.y, initialCrop.h + deltaY));
          break;
        case 'w':
          newX = Math.max(0, initialCrop.x + deltaX);
          newW = initialCrop.w - (newX - initialCrop.x);
          break;
        case 'n':
          newY = Math.max(0, initialCrop.y + deltaY);
          newH = initialCrop.h - (newY - initialCrop.y);
          break;
      }

      setCrop(newX, newY, newW, newH);
      return;
    }

    // If panning canvas
    if (isPanningRef.current) {
      setOffset({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    // Update cursor based on hover
    if (cropActive) {
      const handle = getHandleAtPosition(x, y);
      if (handle === 'move') setActiveCursor('move');
      else if (handle === 'nw' || handle === 'se') setActiveCursor('nwse-resize');
      else if (handle === 'ne' || handle === 'sw') setActiveCursor('nesw-resize');
      else if (handle === 'n' || handle === 's') setActiveCursor('ns-resize');
      else if (handle === 'e' || handle === 'w') setActiveCursor('ew-resize');
      else setActiveCursor('crosshair');
    } else {
      setActiveCursor('grab');
    }
  };

  // Mouse Up
  const handleMouseUp = () => {
    isPanningRef.current = false;
    activeHandleRef.current = null;
    setActiveCursor(cropActive ? 'crosshair' : 'grab');
  };

  // Drag and drop file handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) {
            setPreviewData(result);
          }
        };
        reader.readAsDataURL(file);
      }
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

          {/* Status info overlay */}
          <div className="canvas-status-bar">
            <span className="canvas-status-item">
              Zoom: <strong>{Math.round(scale * 100)}%</strong>
            </span>
            {imageDimensions && (
              <span className="canvas-status-item">
                Size: {imageDimensions.width} × {imageDimensions.height} px
              </span>
            )}
            {cropActive && cropWidth > 0 && (
              <span className="canvas-status-item">
                Crop: {Math.round(cropWidth)} × {Math.round(cropHeight)} px
              </span>
            )}
          </div>
        </>
      ) : (
        <div
          className={`empty-state ${isDragOver ? 'drag-over' : ''}`}
          onClick={onOpenImage}
          role="button"
          tabIndex={0}
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
          <button type="button" className="btn btn-primary" onClick={onOpenImage}>
            Select Image File
          </button>
        </div>
      )}

      {/* Processing Spinner Overlay */}
      {isProcessing && (
        <div className="processing-overlay">
          <div className="spinner" />
          <div className="processing-text">Processing Image...</div>
        </div>
      )}
    </div>
  );
};
