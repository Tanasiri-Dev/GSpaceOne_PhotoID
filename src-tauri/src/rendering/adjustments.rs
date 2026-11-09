use image::RgbaImage;
use rayon::prelude::*;

/// Apply additive brightness adjustment to an RGBA image in-place using Rayon parallel iterators.
///
/// `value` is expected in the range [-1.0, 1.0].
/// Matches WGSL compute shader math: `r = clamp(r / 255.0 + value, 0.0, 1.0) * 255.0`
pub fn apply_brightness(image: &mut RgbaImage, value: f32) {
    if value.abs() < 1e-5 {
        return;
    }

    let delta = value * 255.0;
    image.par_chunks_exact_mut(4).for_each(|pixel| {
        pixel[0] = (pixel[0] as f32 + delta).clamp(0.0, 255.0).round() as u8;
        pixel[1] = (pixel[1] as f32 + delta).clamp(0.0, 255.0).round() as u8;
        pixel[2] = (pixel[2] as f32 + delta).clamp(0.0, 255.0).round() as u8;
        // Alpha channel (pixel[3]) remains untouched
    });
}

/// Apply photographic exposure adjustment to an RGBA image in-place using Rayon parallel iterators.
///
/// Multiplies pixel intensity by 2^exposure.
/// `value` is expected in the range [-3.0, 3.0].
pub fn apply_exposure(image: &mut RgbaImage, value: f32) {
    if value.abs() < 1e-5 {
        return;
    }

    let exp_mult = 2.0_f32.powf(value);
    image.par_chunks_exact_mut(4).for_each(|pixel| {
        pixel[0] = (pixel[0] as f32 * exp_mult).clamp(0.0, 255.0).round() as u8;
        pixel[1] = (pixel[1] as f32 * exp_mult).clamp(0.0, 255.0).round() as u8;
        pixel[2] = (pixel[2] as f32 * exp_mult).clamp(0.0, 255.0).round() as u8;
        // Alpha channel (pixel[3]) remains untouched
    });
}

/// Apply gamma curve correction to an RGBA image in-place using Rayon parallel iterators.
///
/// Power curve: `pixel = (pixel / 255.0) ^ (1 / gamma) * 255.0`.
/// `value` is expected in the range [0.1, 5.0].
pub fn apply_gamma(image: &mut RgbaImage, value: f32) {
    if (value - 1.0).abs() < 1e-4 {
        return;
    }

    let inv_gamma = 1.0 / value.max(0.01);
    image.par_chunks_exact_mut(4).for_each(|pixel| {
        let r = (pixel[0] as f32 / 255.0).clamp(0.0, 1.0).powf(inv_gamma);
        let g = (pixel[1] as f32 / 255.0).clamp(0.0, 1.0).powf(inv_gamma);
        let b = (pixel[2] as f32 / 255.0).clamp(0.0, 1.0).powf(inv_gamma);

        pixel[0] = (r * 255.0).clamp(0.0, 255.0).round() as u8;
        pixel[1] = (g * 255.0).clamp(0.0, 255.0).round() as u8;
        pixel[2] = (b * 255.0).clamp(0.0, 255.0).round() as u8;
        // Alpha channel (pixel[3]) remains untouched
    });
}

/// Unified multi-threaded adjustment pass applying exposure, brightness, and gamma
/// sequentially per-pixel in a single memory iteration.
///
/// Execution order strictly matches the WGSL GPU shader:
/// 1. Exposure (multiplicative by 2^exposure)
/// 2. Brightness (additive)
/// 3. Gamma (power curve by 1/gamma)
/// 4. Clamp to [0, 255]
pub fn apply_all_adjustments(image: &mut RgbaImage, brightness: f32, exposure: f32, gamma: f32) {
    let has_brightness = brightness.abs() >= 1e-5;
    let has_exposure = exposure.abs() >= 1e-5;
    let has_gamma = (gamma - 1.0).abs() >= 1e-4;

    if !has_brightness && !has_exposure && !has_gamma {
        return;
    }

    let exp_mult = 2.0_f32.powf(exposure);
    let inv_gamma = 1.0 / gamma.max(0.01);

    image.par_chunks_exact_mut(4).for_each(|pixel| {
        let mut r = pixel[0] as f32 / 255.0;
        let mut g = pixel[1] as f32 / 255.0;
        let mut b = pixel[2] as f32 / 255.0;

        // 1. Exposure
        if has_exposure {
            r *= exp_mult;
            g *= exp_mult;
            b *= exp_mult;
        }

        // 2. Brightness
        if has_brightness {
            r += brightness;
            g += brightness;
            b += brightness;
        }

        // 3. Gamma correction
        if has_gamma {
            r = r.clamp(0.0, 1.0).powf(inv_gamma);
            g = g.clamp(0.0, 1.0).powf(inv_gamma);
            b = b.clamp(0.0, 1.0).powf(inv_gamma);
        }

        // Repack and clamp
        pixel[0] = (r * 255.0).clamp(0.0, 255.0).round() as u8;
        pixel[1] = (g * 255.0).clamp(0.0, 255.0).round() as u8;
        pixel[2] = (b * 255.0).clamp(0.0, 255.0).round() as u8;
    });
}
