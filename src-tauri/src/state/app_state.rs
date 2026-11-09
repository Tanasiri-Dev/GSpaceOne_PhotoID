use std::sync::Arc;
use image::DynamicImage;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

/// Image adjustment parameters for real-time non-destructive rendering.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ImageAdjustments {
    /// Brightness offset: -1.0 to 1.0 (default 0.0)
    pub brightness: f32,
    /// Exposure adjustment: -3.0 to 3.0 (default 0.0)
    pub exposure: f32,
    /// Gamma correction power factor: 0.1 to 5.0 (default 1.0)
    pub gamma: f32,
}

impl Default for ImageAdjustments {
    fn default() -> Self {
        Self {
            brightness: 0.0,
            exposure: 0.0,
            gamma: 1.0,
        }
    }
}

impl ImageAdjustments {
    /// Create new adjustments clamped to valid ranges.
    pub fn new(brightness: f32, exposure: f32, gamma: f32) -> Self {
        Self {
            brightness: brightness.clamp(-1.0, 1.0),
            exposure: exposure.clamp(-3.0, 3.0),
            gamma: gamma.clamp(0.1, 5.0),
        }
    }

    /// Reset adjustments to neutral defaults.
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Check if adjustments represent identity (no-op).
    pub fn is_identity(&self) -> bool {
        self.brightness == 0.0 && self.exposure == 0.0 && (self.gamma - 1.0).abs() < 1e-4
    }
}

/// Defines a rectangular region for non-destructive cropping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub active: bool,
}

impl Default for CropRegion {
    fn default() -> Self {
        Self {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            active: false,
        }
    }
}

impl CropRegion {
    /// Create an active crop region.
    pub fn new(x: u32, y: u32, width: u32, height: u32) -> Self {
        Self {
            x,
            y,
            width,
            height,
            active: width > 0 && height > 0,
        }
    }

    /// Reset crop region to inactive.
    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// Central application state holding original image data, non-destructive
/// edit parameters, and runtime acceleration status.
#[derive(Default)]
pub struct AppState {
    pub source_image: Option<DynamicImage>,
    pub adjustments: ImageAdjustments,
    pub crop: CropRegion,
    pub gpu_available: bool,
}

/// Type alias for thread-safe shared application state.
pub type SharedAppState = Arc<RwLock<AppState>>;

impl AppState {
    /// Create a new, empty AppState.
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a thread-safe shared AppState reference.
    pub fn new_shared() -> SharedAppState {
        Arc::new(RwLock::new(Self::default()))
    }

    /// Replace the current source image and reset crop.
    pub fn set_image(&mut self, image: DynamicImage) {
        self.source_image = Some(image);
        self.crop.reset();
    }

    /// Check if a source image is currently loaded.
    pub fn has_image(&self) -> bool {
        self.source_image.is_some()
    }

    /// Get dimensions of the loaded source image (width, height), if any.
    pub fn image_dimensions(&self) -> Option<(u32, u32)> {
        use image::GenericImageView;
        self.source_image.as_ref().map(|img| img.dimensions())
    }

    /// Update adjustments with automatic boundary clamping.
    pub fn set_adjustments(&mut self, brightness: f32, exposure: f32, gamma: f32) {
        self.adjustments = ImageAdjustments::new(brightness, exposure, gamma);
    }

    /// Reset adjustments to defaults.
    pub fn reset_adjustments(&mut self) {
        self.adjustments.reset();
    }

    /// Clone current adjustments.
    pub fn clone_adjustments(&self) -> ImageAdjustments {
        self.adjustments
    }

    /// Set crop region.
    pub fn set_crop(&mut self, x: u32, y: u32, width: u32, height: u32) {
        self.crop = CropRegion::new(x, y, width, height);
    }

    /// Reset crop to inactive.
    pub fn reset_crop(&mut self) {
        self.crop.reset();
    }

    /// Clone current crop region.
    pub fn clone_crop(&self) -> CropRegion {
        self.crop
    }

    /// Reset both adjustments and crop.
    pub fn reset_all(&mut self) {
        self.reset_adjustments();
        self.reset_crop();
    }
}
