import React, { useRef, useState, useCallback, useEffect } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useAppStore } from './state/store';
import { PreviewCanvas } from './components/canvas/PreviewCanvas';
import { FloatingSettings } from './components/settings/FloatingSettings';
import { PrintPreview } from './components/print/PrintPreview';
import { useFloatingWindow } from './hooks/useFloatingWindow';

export const App: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewData = useAppStore((state) => state.previewData);
  const isProcessing = useAppStore((state) => state.isProcessing);
  const showPrintPreview = useAppStore((state) => state.showPrintPreview);
  const loadImage = useAppStore((state) => state.loadImage);
  const setPreviewData = useAppStore((state) => state.setPreviewData);
  const resetAll = useAppStore((state) => state.resetAll);
  const executePrint = useAppStore((state) => state.executePrint);
  const togglePrintPreview = useAppStore((state) => state.togglePrintPreview);

  const { isSettingsOpen, closeSettingsWindow, isCurrentWindowSettings } =
    useFloatingWindow();

  // Docked settings panel visibility in the main window
  const [dockedSettingsVisible, setDockedSettingsVisible] = useState<boolean>(true);

  // If this window is the dedicated floating settings window
  const isSettingsSubwindow = isCurrentWindowSettings();

  // If settings window pops out, hide the docked panel
  useEffect(() => {
    if (isSettingsOpen && !isSettingsSubwindow) {
      setDockedSettingsVisible(false);
    }
  }, [isSettingsOpen, isSettingsSubwindow]);

  /**
   * Handle Open Image through native Tauri file dialog, with browser fallback
   */
  const handleOpenImage = useCallback(async () => {
    try {
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
        await loadImage(selected);
      }
    } catch {
      // Fallback to HTML input element when running outside Tauri or if dialog plugin errors
      fileInputRef.current?.click();
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
        <div className="toolbar-brand">
          <div className="toolbar-logo">GS</div>
          <div>
            <span className="toolbar-title">GSpaceOne PhotoID</span>
            <span className="toolbar-subtitle">Tauri v2</span>
          </div>
        </div>

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

          {/* Reset Button */}
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
    </div>
  );
};
