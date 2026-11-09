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

export interface ImageMetadataInfo {
  filePath: string;
  fileName: string;
  fileSizeFormatted: string;
  width: number;
  height: number;
  megapixels: string;
  aspectRatio: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: string;
  shutterSpeed?: string;
  aperture?: string;
  dateTime?: string;
}

export interface AppStore {
  // Image state
  imagePath: string | null;
  previewData: string | null; // base64
  isProcessing: boolean;
  imageDimensions: { width: number; height: number } | null;
  imageInfo: ImageMetadataInfo | null;

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
  showBrandLogo: boolean;

  // UI state
  settingsWindowOpen: boolean;
  showPrintPreview: boolean;
  showPrintModal: boolean;
  showInfoModal: boolean;
  mainWorkspaceMode: 'editor' | 'sheet'; // Swap between single photo editor & full print sheet

  // Actions
  loadImage: (path: string) => Promise<void>;
  fetchImageInfo: () => Promise<void>;
  setShowInfoModal: (show: boolean) => void;
  setShowPrintModal: (show: boolean) => void;
  setShowBrandLogo: (show: boolean) => void;
  setWorkspaceMode: (mode: 'editor' | 'sheet') => void;
  toggleWorkspaceMode: () => void;
  setPreviewData: (data: string | null) => void;
  setImageDimensions: (width: number, height: number) => void;
  applyAdjustments: () => Promise<void>;
  setCrop: (x: number, y: number, w: number, h: number) => Promise<void>;
  setCropActive: (active: boolean) => Promise<void>;
  resetCrop: () => Promise<void>;
  applyIdCropPreset: (sizeKey: string) => Promise<void>;
  saveHighQualityImage: (outputPath: string) => Promise<string>;
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
  '1"': { width: 25.0, height: 35.0 },
  '1.5"': { width: 35.0, height: 45.0 },
  '2"': { width: 50.8, height: 50.8 },
  '2.5"': { width: 50.8, height: 63.5 },
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
  imageInfo: null,

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
  showBrandLogo: true,

  // UI state
  settingsWindowOpen: false,
  showPrintPreview: true, // Default open so user immediately sees both single photo and sheet
  showPrintModal: false,
  showInfoModal: false,
  mainWorkspaceMode: 'editor', // 'editor' for single photo, 'sheet' for full sheet view

  setShowBrandLogo: (show: boolean) => set({ showBrandLogo: show }),
  setShowPrintModal: (show: boolean) => set({ showPrintModal: show }),

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
      // Fetch detailed file and EXIF metadata in background
      get().fetchImageInfo();
    } catch (err) {
      console.warn('Tauri invoke load_image failed or not running in Tauri backend:', err);
    } finally {
      set({ isProcessing: false });
    }
  },

  fetchImageInfo: async () => {
    const { imagePath } = get();
    if (!imagePath) return;
    try {
      const info = await invoke<ImageMetadataInfo>('get_image_info', { path: imagePath });
      if (info) {
        set({ imageInfo: info });
      }
    } catch (err) {
      console.warn('get_image_info invoke error:', err);
    }
  },

  setShowInfoModal: (show: boolean) => set({ showInfoModal: show }),

  setWorkspaceMode: (mode: 'editor' | 'sheet') => set({ mainWorkspaceMode: mode }),

  toggleWorkspaceMode: () =>
    set((state) => ({
      mainWorkspaceMode: state.mainWorkspaceMode === 'editor' ? 'sheet' : 'editor',
    })),

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
      const dim = get().imageDimensions;
      set({
        cropX: 0,
        cropY: 0,
        cropWidth: dim ? dim.width : 0,
        cropHeight: dim ? dim.height : 0,
      });
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

  resetCrop: async () => {
    const dim = get().imageDimensions;
    const w = dim ? dim.width : 0;
    const h = dim ? dim.height : 0;
    set({
      cropActive: false,
      cropX: 0,
      cropY: 0,
      cropWidth: w,
      cropHeight: h,
    });
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
      console.warn('set_crop reset invoke failed:', err);
    }
    get().computeLayout();
  },

  applyIdCropPreset: async (sizeKey: string) => {
    const dim = get().imageDimensions;
    if (!dim || dim.width <= 0 || dim.height <= 0) {
      get().setIdSize(sizeKey);
      return;
    }

    const idDim = ID_DIMENSIONS_MM[sizeKey] || ID_DIMENSIONS_MM['1.5"'];
    const targetAspect = idDim.width / idDim.height;
    const imgAspect = dim.width / dim.height;

    let rw: number;
    let rh: number;

    // Scale crop window to fill 92% of the smaller dimension, centered
    if (imgAspect > targetAspect) {
      rh = Math.round(dim.height * 0.92);
      rw = Math.round(rh * targetAspect);
    } else {
      rw = Math.round(dim.width * 0.92);
      rh = Math.round(rw / targetAspect);
    }

    rw = Math.min(rw, dim.width);
    rh = Math.min(rh, dim.height);
    const rx = Math.round((dim.width - rw) / 2);
    const ry = Math.round((dim.height - rh) / 2);

    set({ selectedIdSize: sizeKey });
    await get().setCrop(rx, ry, rw, rh);
    await get().computeLayout();
  },

  saveHighQualityImage: async (outputPath: string) => {
    const { selectedIdSize, selectedPaperSize, showBrandLogo } = get();
    return await invoke<string>('save_high_quality_image', {
      idSize: selectedIdSize,
      paperSize: selectedPaperSize,
      outputPath,
      showLogo: showBrandLogo,
    });
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

    // Open interactive Print Dialog window with full layout, gamma, scale, margins, position & printer selection
    set({ showPrintModal: true });
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
