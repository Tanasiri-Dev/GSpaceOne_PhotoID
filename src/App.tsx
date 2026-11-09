import React, { useRef, useState, useCallback, useEffect } from 'react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useAppStore } from './state/store';
import { PreviewCanvas } from './components/canvas/PreviewCanvas';
import { FloatingSettings } from './components/settings/FloatingSettings';
import { PrintPreview } from './components/print/PrintPreview';
import { ImageInfoModal } from './components/info/ImageInfoModal';
import { useFloatingWindow } from './hooks/useFloatingWindow';
import appIcon from './assets/app-icon.png';

// Quick Preset Specification matching user reference sheet
interface QuickSizePreset {
  key: string;
  label: string;
  cols: number;
  rows: number;
  aspectDesc: string;
}

const QUICK_SIZE_PRESETS: QuickSizePreset[] = [
  { key: '1"', label: '1 inch', cols: 4, rows: 4, aspectDesc: '25 × 35 mm (16 per sheet)' },
  { key: '1.5"', label: '1.5 inch', cols: 3, rows: 4, aspectDesc: '35 × 45 mm (10-12 per sheet)' },
  { key: '2"', label: '2 inch', cols: 2, rows: 3, aspectDesc: '50.8 × 50.8 mm US Visa (6 per sheet)' },
  { key: '2.5"', label: '2.5 inch', cols: 2, rows: 2, aspectDesc: '50.8 × 63.5 mm (4 per sheet)' },
];

export const App: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewData = useAppStore((state) => state.previewData);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const showPrintPreview = useAppStore((state) => state.showPrintPreview);
  const selectedIdSize = useAppStore((state) => state.selectedIdSize);
  const selectedPaperSize = useAppStore((state) => state.selectedPaperSize);
  const cropActive = useAppStore((state) => state.cropActive);
  const mainWorkspaceMode = useAppStore((state) => state.mainWorkspaceMode);

  const loadImage = useAppStore((state) => state.loadImage);
  const fetchImageInfo = useAppStore((state) => state.fetchImageInfo);
  const setShowInfoModal = useAppStore((state) => state.setShowInfoModal);
  const toggleWorkspaceMode = useAppStore((state) => state.toggleWorkspaceMode);
  const setPreviewData = useAppStore((state) => state.setPreviewData);
  const resetAll = useAppStore((state) => state.resetAll);
  const resetCrop = useAppStore((state) => state.resetCrop);
  const applyIdCropPreset = useAppStore((state) => state.applyIdCropPreset);
  const saveHighQualityImage = useAppStore((state) => state.saveHighQualityImage);
  const executePrint = useAppStore((state) => state.executePrint);
  const togglePrintPreview = useAppStore((state) => state.togglePrintPreview);

  const { isSettingsOpen, closeSettingsWindow, isCurrentWindowSettings } =
    useFloatingWindow();

  // Docked settings panel visibility in the main window
  const [dockedSettingsVisible, setDockedSettingsVisible] = useState<boolean>(true);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // If this window is the dedicated floating settings window
  const isSettingsSubwindow = isCurrentWindowSettings();

  // If settings window pops out, hide the docked panel
  useEffect(() => {
    if (isSettingsOpen && !isSettingsSubwindow) {
      setDockedSettingsVisible(false);
    }
  }, [isSettingsOpen, isSettingsSubwindow]);

  const isOpeningDialogRef = useRef<boolean>(false);

  /**
   * Handle Open Image through native Tauri file dialog, with browser fallback.
   * Uses isOpeningDialogRef mutex to prevent duplicate dialogs when clicking quickly or bubbling.
   * Defers loadImage by 50ms so Windows comctl32 cleanly unhooks and closes the dialog window immediately.
   */
  const handleOpenImage = useCallback(async () => {
    if (isOpeningDialogRef.current) return;
    isOpeningDialogRef.current = true;

    try {
      const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
      if (isTauri) {
        const selected = await openDialog({
          multiple: false,
          filters: [
            {
              name: 'Images',
              extensions: ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp'],
            },
          ],
        });

        if (selected && typeof selected === 'string') {
          setTimeout(async () => {
            await loadImage(selected);
          }, 50);
        }
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      console.warn('openDialog error, falling back to input:', err);
      fileInputRef.current?.click();
    } finally {
      setTimeout(() => {
        isOpeningDialogRef.current = false;
      }, 350);
    }
  }, [loadImage]);

  /**
   * Web file input change fallback
   */
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

  /**
   * Toggle settings: if floating window is open, close it; else toggle docked panel
   */
  const handleToggleSettings = () => {
    if (isSettingsOpen) {
      closeSettingsWindow();
      setDockedSettingsVisible(true);
    } else {
      setDockedSettingsVisible((prev) => !prev);
    }
  };

  /**
   * Handle Save High Quality Image for photo lab printing (600 DPI)
   */
  const handleSaveHighQuality = useCallback(async () => {
    if (!previewData || isProcessing) return;

    try {
      const sanitizedId = selectedIdSize.replace(/[^a-zA-Z0-9.]/g, '');
      const sanitizedPaper = selectedPaperSize.replace(/[^a-zA-Z0-9]/g, '');
      const defaultFileName = `GSpaceOne_PhotoID_${sanitizedId}_${sanitizedPaper}_600DPI.png`;

      const filePath = await saveDialog({
        title: 'Save High Quality Photo ID Sheet (600 DPI)',
        defaultPath: defaultFileName,
        filters: [
          { name: 'PNG Image (*.png)', extensions: ['png'] },
          { name: 'JPEG Image (*.jpg)', extensions: ['jpg', 'jpeg'] },
        ],
      });

      if (filePath) {
        await saveHighQualityImage(filePath);
        setSaveSuccessMsg('600 DPI sheet exported!');
        setTimeout(() => setSaveSuccessMsg(null), 3500);
      }
    } catch (err) {
      console.error('Save high quality image failed:', err);
      setSaveSuccessMsg('Export error: ' + String(err));
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    }
  }, [previewData, isProcessing, selectedIdSize, selectedPaperSize, saveHighQualityImage]);

  // If this window is loaded as the detached settings window
  if (isSettingsSubwindow) {
    return (
      <div className="floating-settings-container">
        <FloatingSettings isStandalone={true} />
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Hidden file input for web fallback */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/png,image/jpeg,image/webp,image/tiff,image/bmp"
        style={{ display: 'none' }}
      />

      {/* Top Application Toolbar */}
      <header className="toolbar">
        {/* Brand Identity */}
        <div className="toolbar-brand">
          <img
            src={appIcon}
            alt="GSpaceOne Logo"
            className="toolbar-app-icon"
            style={{ width: '32px', height: '32px', borderRadius: '7px', objectFit: 'contain' }}
          />
          <div>
            <span className="toolbar-title">GSpaceOne PhotoID</span>
            <span className="toolbar-subtitle">Tauri v2</span>
          </div>
        </div>

        {/* Center: Quick ID Size Presets (1", 1.5", 2", 2.5") with Miniature Grid Cards */}
        <div className="toolbar-quick-sizes" role="group" aria-label="Quick ID Photo Size Selection">
          {QUICK_SIZE_PRESETS.map((preset) => {
            const isSelected = selectedIdSize === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                className={`quick-size-card ${isSelected ? 'active' : ''}`}
                onClick={() => applyIdCropPreset(preset.key)}
                title={`Select ${preset.label} (${preset.aspectDesc}) - automatically adjusts crop framing and print layout`}
              >
                <div className="quick-size-icon-wrapper">
                  <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
                    {/* Sheet Outline */}
                    <rect
                      x="1"
                      y="1"
                      width="20"
                      height="24"
                      rx="2"
                      fill="#ffffff"
                      stroke={isSelected ? '#e12d4d' : '#94a3b8'}
                      strokeWidth="1"
                    />
                    {/* Yellow ID Grid Boxes */}
                    {Array.from({ length: preset.rows }).map((_, r) => {
                      return Array.from({ length: preset.cols }).map((_, c) => {
                        const cellW = (16 - (preset.cols - 1) * 1.5) / preset.cols;
                        const cellH = (20 - (preset.rows - 1) * 1.5) / preset.rows;
                        const x = 3 + c * (cellW + 1.5);
                        const y = 3 + r * (cellH + 1.5);
                        return (
                          <rect
                            key={`${r}-${c}`}
                            x={x}
                            y={y}
                            width={cellW}
                            height={cellH}
                            rx="0.5"
                            fill="#f59e0b"
                          />
                        );
                      });
                    })}
                  </svg>
                </div>
                <span className="quick-size-label">{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Toolbar Actions */}
        <div className="toolbar-actions">
          {/* Open Image Button */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleOpenImage}
            disabled={isProcessing}
            title="Open an image file from disk"
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
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Open Image
          </button>

          {/* Reset to Original Image Button */}
          <button
            type="button"
            className={`btn btn-secondary ${cropActive ? 'btn-highlight-subtle' : ''}`}
            onClick={resetCrop}
            disabled={!previewData || isProcessing}
            title="Reset crop box back to original uncropped image"
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
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Reset to Original
          </button>

          {/* Save High Quality Image for Photo Lab (600 DPI) */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSaveHighQuality}
            disabled={!previewData || isProcessing}
            title="Save 600 DPI high-resolution sheet with crop marks and GSpaceOne logo for photo printing lab"
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
            {saveSuccessMsg || 'Save for Lab (600 DPI)'}
          </button>

          {/* Swap Main Workspace View (Editor vs Full Print Sheet) */}
          <button
            type="button"
            className={`btn btn-secondary ${mainWorkspaceMode === 'sheet' ? 'btn-active' : ''}`}
            onClick={toggleWorkspaceMode}
            disabled={!previewData}
            title={mainWorkspaceMode === 'sheet' ? 'Switch back to Single Photo Editor View' : 'Swap big area to Full Print Sheet View'}
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
              <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            {mainWorkspaceMode === 'sheet' ? 'Edit Photo' : 'Swap View'}
          </button>

          {/* Toggle Settings Panel Button */}
          <button
            type="button"
            className={`btn btn-secondary ${
              dockedSettingsVisible || isSettingsOpen ? 'btn-active' : ''
            }`}
            onClick={handleToggleSettings}
            title="Toggle settings panel or window"
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
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings {isSettingsOpen ? '(Floating)' : ''}
          </button>

          {/* Toggle Print Preview Button */}
          <button
            type="button"
            className={`btn btn-secondary ${showPrintPreview ? 'btn-active' : ''}`}
            onClick={togglePrintPreview}
            title="Toggle print layout preview side panel"
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
              <path d="M6 9V2h12v7" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect width="12" height="8" x="6" y="14" />
            </svg>
            Print Preview
          </button>

          {/* Print Button */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={executePrint}
            disabled={!previewData || isProcessing}
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
            Print
          </button>

          {/* Image Info & EXIF Metadata Modal Button */}
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={() => {
              fetchImageInfo();
              setShowInfoModal(true);
            }}
            disabled={!previewData}
            title="View Image Information & EXIF Metadata"
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>

          {/* Reset All Button */}
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={resetAll}
            title="Reset All Adjustments and Crop"
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
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="main-workspace">
        {/* Center Canvas */}
        <PreviewCanvas onOpenImage={handleOpenImage} />

        {/* Docked Settings Side Panel */}
        {dockedSettingsVisible && !isSettingsOpen && (
          <FloatingSettings isStandalone={false} onClose={() => setDockedSettingsVisible(false)} />
        )}

        {/* Optional Print Preview Side Panel */}
        {showPrintPreview && <PrintPreview />}
      </main>

      {/* Image Info & EXIF Modal */}
      <ImageInfoModal />
    </div>
  );
};