import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useAppStore } from '../state/store';

export function useFloatingWindow() {
  const storeSettingsOpen = useAppStore((state) => state.settingsWindowOpen);
  const setStoreSettingsOpen = useAppStore((state) => state.setSettingsWindowOpen);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(storeSettingsOpen);

  // Sync internal state with Zustand store
  useEffect(() => {
    setIsSettingsOpen(storeSettingsOpen);
  }, [storeSettingsOpen]);

  // Listen for window close events or destroy events
  useEffect(() => {
    let unlistenClose: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const settingsWin = await WebviewWindow.getByLabel('settings');
        if (settingsWin) {
          unlistenClose = await settingsWin.onCloseRequested(() => {
            setIsSettingsOpen(false);
            setStoreSettingsOpen(false);
          });
        }
      } catch (err) {
        // May fail if not running within a Tauri runtime
        console.debug('Floating window listener setup:', err);
      }
    };

    if (isSettingsOpen) {
      setupListener();
    }

    return () => {
      if (unlistenClose) {
        unlistenClose();
      }
    };
  }, [isSettingsOpen, setStoreSettingsOpen]);

  /**
   * Opens the floating settings window
   */
  const openSettingsWindow = useCallback(async () => {
    setIsSettingsOpen(true);
    setStoreSettingsOpen(true);

    try {
      // 1. First attempt calling the Tauri backend command
      await invoke('open_settings_window');
    } catch {
      // 2. If command doesn't exist, create/show via WebviewWindow API
      try {
        let existing = await WebviewWindow.getByLabel('settings');
        if (existing) {
          await existing.show();
          await existing.setFocus();
        } else {
          const newWin = new WebviewWindow('settings', {
            url: 'index.html?window=settings',
            title: 'Adjustment & Print Settings',
            width: 380,
            height: 640,
            minWidth: 320,
            minHeight: 480,
            resizable: true,
            alwaysOnTop: true,
          });

          await newWin.once('tauri://error', (e) => {
            console.error('Failed to create settings window:', e);
            setIsSettingsOpen(false);
            setStoreSettingsOpen(false);
          });

          await newWin.once('tauri://close-requested', () => {
            setIsSettingsOpen(false);
            setStoreSettingsOpen(false);
          });
        }
      } catch (err) {
        console.warn('Could not launch separate WebviewWindow:', err);
      }
    }
  }, [setStoreSettingsOpen]);

  /**
   * Closes the floating settings window
   */
  const closeSettingsWindow = useCallback(async () => {
    setIsSettingsOpen(false);
    setStoreSettingsOpen(false);

    try {
      // Attempt backend command first
      await invoke('close_settings_window');
    } catch {
      try {
        const existing = await WebviewWindow.getByLabel('settings');
        if (existing) {
          await existing.close();
        }
      } catch (err) {
        console.debug('Close settings window error:', err);
      }
    }
  }, [setStoreSettingsOpen]);

  /**
   * Check if current window itself is the floating settings window
   */
  const isCurrentWindowSettings = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('window') === 'settings') return true;

    try {
      const current = getCurrentWindow();
      return current?.label === 'settings';
    } catch {
      return false;
    }
  }, []);

  return {
    openSettingsWindow,
    closeSettingsWindow,
    isSettingsOpen,
    isCurrentWindowSettings,
  };
}
