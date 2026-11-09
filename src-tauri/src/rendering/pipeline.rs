use std::io::Cursor;
use image::{DynamicImage, GenericImageView, ImageFormat, RgbaImage};
use log::warn;
use thiserror::Error;

use crate::rendering::adjustments::apply_all_adjustments;
use crate::rendering::gpu_compute::GpuComputeEngine;
use crate::state::app_state::AppState;

/// Errors that can occur during image pipeline rendering.
#[derive(Debug, Error)]
pub enum RenderError {
    #[error("No source image is currently loaded in application state")]
    NoImageLoaded,
    #[error("Image processing error: {0}")]
    Image(#[from] image::ImageError),
    #[error("I/O error during image encoding: {0}")]
    Io(#[from] std::io::Error),
    #[error("GPU acceleration error: {0}")]
    Gpu(String),
}

/// Non-destructive rendering pipeline that executes operations in strict sequence:
/// Crop -> Scale -> Brightness -> Exposure -> Gamma
pub struct RenderPipeline<'a> {
    pub state: &'a AppState,
    pub gpu: Option<&'a GpuComputeEngine>,
}

impl<'a> RenderPipeline<'a> {
    /// Create a new render pipeline using the given AppState.
    pub fn new(state: &'a AppState) -> Self {
        Self { state, gpu: None }
    }

    /// Create a new render pipeline with optional GPU compute acceleration.
    pub fn with_gpu(state: &'a AppState, gpu: Option<&'a GpuComputeEngine>) -> Self {
        Self { state, gpu }
    }

    /// Render downscaled preview with all non-destructive adjustments applied.
    /// Returns PNG-encoded bytes.
    pub fn render_preview(&self, max_size: u32) -> Result<Vec<u8>, RenderError> {
        let full_img = self.state.source_image.as_ref().ok_or(RenderError::NoImageLoaded)?;

        // 1. Non-destructive Crop
        let cropped = crop_image(full_img, &self.state.crop);

        // 2. Downscale for preview performance
        let scaled = if max_size > 0 && (cropped.width() > max_size || cropped.height() > max_size) {
            cropped.resize(max_size, max_size, image::imageops::FilterType::Triangle)
        } else {
            cropped
        };

        // 3. Apply color adjustments (GPU with automatic CPU fallback)
        let mut rgba = scaled.to_rgba8();
        apply_pipeline_adjustments(
            &mut rgba,
            self.state,
            self.gpu,
        )?;

        // 4. Encode to PNG
        let mut bytes = Vec::new();
        let mut cursor = Cursor::new(&mut bytes);
        DynamicImage::ImageRgba8(rgba).write_to(&mut cursor, ImageFormat::Png)?;

        Ok(bytes)
    }

    /// Render full-resolution image with all non-destructive adjustments applied.
    pub fn render_full(&self) -> Result<DynamicImage, RenderError> {
        let full_img = self.state.source_image.as_ref().ok_or(RenderError::NoImageLoaded)?;

        // 1. Non-destructive Crop
        let cropped = crop_image(full_img, &self.state.crop);

        // 2. Full resolution RGBA conversion
        let mut rgba = cropped.to_rgba8();

        // 3. Apply color adjustments (GPU with automatic CPU fallback)
        apply_pipeline_adjustments(
            &mut rgba,
            self.state,
            self.gpu,
        )?;

        Ok(DynamicImage::ImageRgba8(rgba))
    }
}

/// Convenience function to render a preview from AppState without manual pipeline construction.
pub fn render_preview(state: &AppState, max_size: u32) -> Result<Vec<u8>, RenderError> {
    RenderPipeline::new(state).render_preview(max_size)
}

/// Convenience function to render a preview from AppState with GPU support.
pub fn render_preview_with_gpu(
    state: &AppState,
    gpu: Option<&GpuComputeEngine>,
    max_size: u32,
) -> Result<Vec<u8>, RenderError> {
    RenderPipeline::with_gpu(state, gpu).render_preview(max_size)
}

/// Convenience function to render full resolution DynamicImage from AppState.
pub fn render_full(state: &AppState) -> Result<DynamicImage, RenderError> {
    RenderPipeline::new(state).render_full()
}

/// Convenience function to render full resolution DynamicImage with GPU support.
pub fn render_full_with_gpu(
    state: &AppState,
    gpu: Option<&GpuComputeEngine>,
) -> Result<DynamicImage, RenderError> {
    RenderPipeline::with_gpu(state, gpu).render_full()
}

/// Helper to safely extract the cropped sub-image based on CropRegion bounds.
fn crop_image(img: &DynamicImage, crop: &crate::state::app_state::CropRegion) -> DynamicImage {
    if !crop.active || crop.width == 0 || crop.height == 0 {
        return img.clone();
    }

    let (img_w, img_h) = img.dimensions();
    let x = crop.x.min(img_w);
    let y = crop.y.min(img_h);
    let width = crop.width.min(img_w.saturating_sub(x));
    let height = crop.height.min(img_h.saturating_sub(y));

    if width == 0 || height == 0 {
        img.clone()
    } else {
        img.crop_imm(x, y, width, height)
    }
}

/// Helper to apply adjustments via GPU if available, otherwise fallback to multi-threaded CPU.
fn apply_pipeline_adjustments(
    rgba: &mut RgbaImage,
    state: &AppState,
    gpu: Option<&GpuComputeEngine>,
) -> Result<(), RenderError> {
    let adj = state.adjustments;
    if adj.is_identity() {
        return Ok(());
    }

    let (width, height) = (rgba.width(), rgba.height());

    // Try GPU execution if engine is active and enabled
    if state.gpu_available {
        if let Some(engine) = gpu {
            match engine.process_image(rgba.as_raw(), width, height, adj.brightness, adj.exposure, adj.gamma) {
                Ok(processed) => {
                    if let Some(new_img) = RgbaImage::from_raw(width, height, processed) {
                        *rgba = new_img;
                        return Ok(());
                    }
                }
                Err(err) => {
                    warn!("GPU processing failed ({err}), falling back to parallel Rayon CPU execution.");
                }
            }
        }
    }

    // CPU fallback path via Rayon parallel pixel processing
    apply_all_adjustments(rgba, adj.brightness, adj.exposure, adj.gamma);
    Ok(())
}
