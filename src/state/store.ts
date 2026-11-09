import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface PrintLayoutInfo {
  idSize: string;
  paperSize: string;
  photoCount: number;
  columns: number;
  rows: number;
  marginHorizontalMm: number;
  marginVerticalMm: number;
  spacingMm: number;
  idWidthMm: number;
  idHeightMm: number;
  paperWidthMm: number;
  paperHeightMm: number;
  isLandscape?: boolean;
}

export interface AppStore {
  // Image state
  imagePath: string | null;
  previewData: string | null; // base64
  isProcessing: boolean;
  imageDimensions: { width: number; height: number } | null;

  // Adjustment state
  brightness: number; // -100 to 100 (maps to -1.0 to 1.0)
  exposure: number; // -3.0 to 3.0
  gamma: number; // 0.1 to 5.0, default 1.0

  // Crop state
  cropActive: boolean;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;

  // Print state
  selectedIdSize: string;
  selectedPaperSize: string;
  printLayoutInfo: PrintLayoutInfo | null;

  // UI state
  settingsWindowOpen: boolean;
  showPrintPreview: boolean;

  // Actions
  loadImage: (path: string) => Promise<void>;
  setPreviewData: (data: string | null) => void;
  setImageDimensions: (width: number, height: number) => void;
  applyAdjustments: () => Promise<void>;
  setCrop: (x: number, y: number, w: number, h: number) => void;
  setCropActive: (active: boolean) => void;
  setAdjustment: (key: 'brightness' | 'exposure' | 'gamma', value: number) => void;
  resetAdjustments: () => void;
  toggleSettingsWindow: () => void;
  setSettingsWindowOpen: (open: boolean) => void;
  togglePrintPreview: () => void;
  setIdSize: (size: string) => void;
  setPaperSize: (size: string) => void;
  computeLayout: () => Promise<void>;
  executePrint: () => Promise<void>;
  resetAll: () => void;
}

// Standard Paper Dimensions in Millimeters
export const PAPER_DIMENSIONS_MM: Record<string, { width: number; height: number }> = {
  '4×6': { width: 101.6, height: 152.4 },
  '5×7': { width: 127.0, height: 177.8 },
  'A4': { width: 210.0, height: 297.0 },
  'Letter': { width: 215.9, height: 279.4 },
};

// Standard Photo ID Dimensions in Millimeters
export const ID_DIMENSIONS_MM: Record<string, { width: number; height: number }> = {
  '1"': { width: 25.4, height: 35.0 },
  '1.5"': { width: 35.0, height: 45.0 },
  '2"': { width: 50.8, height: 50.8 },
  '2.5"': { width: 60.0, height: 70.0 },
};

/**
 * Helper to calculate the optimal grid layout for placing ID photos on paper
 */
export function calculatePrintLayout(
  idSizeKey: string,
  paperSizeKey: string
): PrintLayoutInfo {
  const idDim = ID_DIMENSIONS_MM[idSizeKey] || ID_DIMENSIONS_MM['2"'];
  const paperDim = PAPER_DIMENSIONS_MM[paperSizeKey] || PAPER_DIMENSIONS_MM['4×6'];

  const spacing = 3.0; // 3mm spacing between photos
  const minMargin = 5.0; // 5mm minimum edge margin

  // Evaluate portrait paper orientation
  const portCols = Math.max(
    1,
    Math.floor((paperDim.width - 2 * minMargin + spacing) / (idDim.width + spacing))
  );
  const portRows = Math.max(
    1,
    Math.floor((paperDim.height - 2 * minMargin + spacing) / (idDim.height + spacing))
  );
  const portCount = portCols * portRows;

  // Evaluate landscape paper orientation
  const landPaperWidth = paperDim.height;
  const landPaperHeight = paperDim.width;
  const landCols = Math.max(
    1,
    Math.floor((landPaperWidth - 2 * minMargin + spacing) / (idDim.width + spacing))
  );
  const landRows = Math.max(
    1,
    Math.floor((landPaperHeight - 2 * minMargin + spacing) / (idDim.height + spacing))
  );
  const landCount = landCols * landRows;

  // Pick orientation with maximum photos
  const useLandscape = landCount > portCount;
  const actualPaperWidth = useLandscape ? landPaperWidth : paperDim.width;
  const actualPaperHeight = useLandscape ? landPaperHeight : paperDim.height;
  const columns = useLandscape ? landCols : portCols;
  const rows = useLandscape ? landRows : portRows;
  const photoCount = columns * rows;

  // Calculate centered margins
  const totalGridWidth = columns * idDim.width + (columns - 1) * spacing;
  const totalGridHeight = rows * idDim.height + (rows - 1) * spacing;

  const marginHorizontalMm = Math.max(0, (actualPaperWidth - totalGridWidth) / 2);
  const marginVerticalMm = Math.max(0, (actualPaperHeight - totalGridHeight) / 2);

  return {
    idSize: idSizeKey,
    paperSize: paperSizeKey,
    photoCount,
    columns,
    rows,
    marginHorizontalMm: Math.round(marginHorizontalMm * 10) / 10,
    marginVerticalMm: Math.round(marginVerticalMm * 10) / 10,
    spacingMm: spacing,
    idWidthMm: idDim.width,
    idHeightMm: idDim.height,
    paperWidthMm: actualPaperWidth,
    paperHeightMm: actualPaperHeight,
    isLandscape: useLandscape,
  };
}

// Module-level debounce timer for adjustments (50ms)
let debounceAdjustmentTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppStore>((set, get) => ({
  // Image state
  imagePath: null,
  previewData: null,
  isProcessing: false,
  imageDimensions: null,

  // Adjustment state
  brightness: 0,
  exposure: 0,
  gamma: 1.0,

  // Crop state
  cropActive: false,
  cropX: 0,
  cropY: 0,
  cropWidth: 0,
  cropHeight: 0,

  // Print state
  selectedIdSize: '2"',
  selectedPaperSize: '4×6',
  printLayoutInfo: calculatePrintLayout('2"', '4×6'),

  // UI state
  settingsWindowOpen: false,
  showPrintPreview: false,

  // Actions
  loadImage: async (path: string) => {
    set({ isProcessing: true, imagePath: path });
    try {
      // Invoke Tauri backend command 'load_image'
      const result = await invoke<{ previewData: string; width: number; height: number }>(
        'load_image',
        { path }
      );
      if (result && result.previewData) {
        set({
          previewData: result.previewData,
          imageDimensions: { width: result.width, height: result.height },
          cropX: 0,
          cropY: 0,
          cropWidth: result.width,
          cropHeight: result.height,
        });
      }
    } catch (err) {
      console.warn('Tauri invoke load_image failed or not running in Tauri backend:', err);
      // Fallback for development/preview testing: create a basic canvas placeholder if needed
    } finally {
      set({ isProcessing: false });
    }
  },

  setPreviewData: (data: string | null) => set({ previewData: data }),

  setImageDimensions: (width: number, height: number) =>
    set({
      imageDimensions: { width, height },
      cropWidth: width,
      cropHeight: height,
    }),

  applyAdjustments: async () => {
    if (debounceAdjustmentTimer) {
      clearTimeout(debounceAdjustmentTimer);
    }

    return new Promise<void>((resolve) => {
      debounceAdjustmentTimer = setTimeout(async () => {
        const state = get();
        if (!state.imagePath && !state.previewData) {
          resolve();
          return;
        }

        set({ isProcessing: true });
        try {
          // Normalize brightness to -1.0 to 1.0
          const normalizedBrightness = state.brightness / 100.0;

          const updatedPreview = await invoke<string>('apply_adjustments', {
            brightness: normalizedBrightness,
            exposure: state.exposure,
            gamma: state.gamma,
          });

          if (updatedPreview) {
            set({ previewData: updatedPreview });
          }
        } catch (err) {
          console.warn('apply_adjustments invoke error:', err);
        } finally {
          set({ isProcessing: false });
          resolve();
        }
      }, 50); // 50ms debounce
    });
  },

  setCrop: async (x: number, y: number, w: number, h: number) => {
    const rx = Math.round(Math.max(0, x));
    const ry = Math.round(Math.max(0, y));
    const rw = Math.round(Math.max(1, w));
    const rh = Math.round(Math.max(1, h));

    set({
      cropX: rx,
      cropY: ry,
      cropWidth: rw,
      cropHeight: rh,
      cropActive: true,
    });

    try {
      const updatedPreview = await invoke<string>('set_crop', {
        x: rx,
        y: ry,
        width: rw,
        height: rh,
      });
      if (updatedPreview) {
        set({ previewData: updatedPreview });
      }
    } catch (err) {
      console.warn('set_crop invoke failed:', err);
    }
  },

  setCropActive: async (active: boolean) => {
    set({ cropActive: active });
    if (!active) {
      try {
        const updatedPreview = await invoke<string>('set_crop', {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        });
        if (updatedPreview) {
          set({ previewData: updatedPreview });
        }
      } catch (err) {
        console.warn('reset_crop invoke failed:', err);
      }
    }
  },

  setAdjustment: (key: 'brightness' | 'exposure' | 'gamma', value: number) => {
    set({ [key]: value } as Pick<AppStore, typeof key>);
    get().applyAdjustments();
  },

  resetAdjustments: () => {
    set({
      brightness: 0,
      exposure: 0,
      gamma: 1.0,
    });
    get().applyAdjustments();
  },

  toggleSettingsWindow: () => {
    set((state) => ({ settingsWindowOpen: !state.settingsWindowOpen }));
  },

  setSettingsWindowOpen: (open: boolean) => {
    set({ settingsWindowOpen: open });
  },

  togglePrintPreview: () => {
    set((state) => ({ showPrintPreview: !state.showPrintPreview }));
  },

  setIdSize: (size: string) => {
    set({ selectedIdSize: size });
    get().computeLayout();
  },

  setPaperSize: (size: string) => {
    set({ selectedPaperSize: size });
    get().computeLayout();
  },

  computeLayout: async () => {
    const { selectedIdSize, selectedPaperSize } = get();
    set({ isProcessing: true });
    try {
      const layout = await invoke<PrintLayoutInfo>('get_print_layout', {
        idSize: selectedIdSize,
        paperSize: selectedPaperSize,
      });
      if (layout) {
        set({ printLayoutInfo: layout });
        return;
      }
    } catch (err) {
      console.warn('get_print_layout invoke failed, using client fallback:', err);
      // Fallback to internal computation if backend method not ready
      const fallbackLayout = calculatePrintLayout(selectedIdSize, selectedPaperSize);
      set({ printLayoutInfo: fallbackLayout });
    } finally {
      set({ isProcessing: false });
    }
  },

  executePrint: async () => {
    const state = get();
    if (!state.imagePath && !state.previewData) {
      console.warn('No image loaded to print');
      return;
    }

    set({ isProcessing: true });
    try {
      await invoke('execute_print', {
        idSize: state.selectedIdSize,
        paperSize: state.selectedPaperSize,
      });
    } catch (err) {
      console.error('execute_print invoke failed:', err);
    } finally {
      set({ isProcessing: false });
    }
  },

  resetAll: () => {
    const dim = get().imageDimensions;
    set({
      brightness: 0,
      exposure: 0,
      gamma: 1.0,
      cropActive: false,
      cropX: 0,
      cropY: 0,
      cropWidth: dim ? dim.width : 0,
      cropHeight: dim ? dim.height : 0,
    });
    get().applyAdjustments();
  },
}));
