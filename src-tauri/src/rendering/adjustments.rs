use image::RgbaImage;
use rayon::prelude::*;

/// Precompute a 256-entry lookup table (LUT) mapping input byte [0..=255]
/// through exposure, brightness, and gamma adjustments.
#[inline]
pub fn build_adjustment_lut(brightness: f32, exposure: f32, gamma: f32) -> [u8; 256] {
    let has_brightness = brightness.abs() >= 1e-5;
    let has_exposure = exposure.abs() >= 1e-5;
    let has_gamma = (gamma - 1.0).abs() >= 1e-4;

    let exp_mult = if has_exposure { 2.0_f32.powf(exposure) } else { 1.0 };
    let inv_gamma = if has_gamma { 1.0 / gamma.max(0.01) } else { 1.0 };

    let mut lut = [0u8; 256];
    for (i, entry) in lut.iter_mut().enumerate() {
        let mut val = (i as f32) / 255.0;

        // 1. Exposure (multiplicative)
        if has_exposure {
            val *= exp_mult;
        }

        // 2. Brightness (additive)
        if has_brightness {
            val += brightness;
        }

        // 3. Gamma (power curve)
        if has_gamma {
            val = val.clamp(0.0, 1.0).powf(inv_gamma);
        }

        *entry = (val * 255.0).clamp(0.0, 255.0).round() as u8;
    }
    lut
}

/// Apply additive brightness adjustment to an RGBA image in-place using Rayon parallel iterators.
pub fn apply_brightness(image: &mut RgbaImage, value: f32) {
    if value.abs() < 1e-5 {
        return;
    }
    let lut = build_adjustment_lut(value, 0.0, 1.0);
    apply_lut(image, &lut);
}

/// Apply photographic exposure adjustment to an RGBA image in-place using Rayon parallel iterators.
pub fn apply_exposure(image: &mut RgbaImage, value: f32) {
    if value.abs() < 1e-5 {
        return;
    }
    let lut = build_adjustment_lut(0.0, value, 1.0);
    apply_lut(image, &lut);
}

/// Apply gamma curve correction to an RGBA image in-place using Rayon parallel iterators.
pub fn apply_gamma(image: &mut RgbaImage, value: f32) {
    if (value - 1.0).abs() < 1e-4 {
        return;
    }
    let lut = build_adjustment_lut(0.0, 0.0, value);
    apply_lut(image, &lut);
}

/// Unified multi-threaded adjustment pass applying exposure, brightness, and gamma
/// sequentially per-pixel using a single-pass 256-entry lookup table (LUT) and Rayon.
pub fn apply_all_adjustments(image: &mut RgbaImage, brightness: f32, exposure: f32, gamma: f32) {
    let has_brightness = brightness.abs() >= 1e-5;
    let has_exposure = exposure.abs() >= 1e-5;
    let has_gamma = (gamma - 1.0).abs() >= 1e-4;

    if !has_brightness && !has_exposure && !has_gamma {
        return;
    }

    let lut = build_adjustment_lut(brightness, exposure, gamma);
    apply_lut(image, &lut);
}

/// Apply a precomputed 256-entry lookup table in parallel across all RGBA pixels with Rayon.
#[inline]
fn apply_lut(image: &mut RgbaImage, lut: &[u8; 256]) {
    image.par_chunks_exact_mut(4).for_each(|pixel| {
        pixel[0] = lut[pixel[0] as usize];
        pixel[1] = lut[pixel[1] as usize];
        pixel[2] = lut[pixel[2] as usize];
        // Alpha channel (pixel[3]) remains untouched
    });
}
