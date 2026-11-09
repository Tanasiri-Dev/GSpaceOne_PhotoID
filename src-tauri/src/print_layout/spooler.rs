use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::print_layout::paper::{IdPhotoSize, PaperSize};
use crate::rendering::adjustments::apply_all_adjustments;
use crate::rendering::pipeline::RenderError;
use crate::state::app_state::AppState;

/// Exact pixel placement of a single photo instance on the printed sheet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PhotoPosition {
    pub row: u32,
    pub col: u32,
    pub x_offset: u32,
    pub y_offset: u32,
    pub width: u32,
    pub height: u32,
}

/// Geometric layout specifying how photos are tiled onto standard paper sizes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintLayout {
    pub paper_name: String,
    pub id_size_name: String,
    pub paper_width_px: u32,
    pub paper_height_px: u32,
    pub photo_width_px: u32,
    pub photo_height_px: u32,
    pub cols: u32,
    pub rows: u32,
    pub total_photos: u32,
    pub positions: Vec<PhotoPosition>,
    pub dpi: u32,
    pub orientation: String,
}

/// Serializable view of layout parameters sent across Tauri IPC to the frontend UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintLayoutInfo {
    pub paper_name: String,
    pub id_size_name: String,
    pub paper_width_px: u32,
    pub paper_height_px: u32,
    pub photo_width_px: u32,
    pub photo_height_px: u32,
    pub cols: u32,
    pub rows: u32,
    pub total_photos: u32,
    pub dpi: u32,
    pub orientation: String,
    pub positions: Vec<PhotoPosition>,
}

impl From<&PrintLayout> for PrintLayoutInfo {
    fn from(l: &PrintLayout) -> Self {
        Self {
            paper_name: l.paper_name.clone(),
            id_size_name: l.id_size_name.clone(),
            paper_width_px: l.paper_width_px,
            paper_height_px: l.paper_height_px,
            photo_width_px: l.photo_width_px,
            photo_height_px: l.photo_height_px,
            cols: l.cols,
            rows: l.rows,
            total_photos: l.total_photos,
            dpi: l.dpi,
            orientation: l.orientation.clone(),
            positions: l.positions.clone(),
        }
    }
}

/// Configuration candidate evaluated during auto-layout search.
struct LayoutCandidate {
    page_w: f64,
    page_h: f64,
    photo_w: f64,
    photo_h: f64,
    cols: u32,
    rows: u32,
    total: u32,
    orientation: &'static str,
}

/// Computes the optimal print layout to maximize the number of ID photos on paper.
///
/// Evaluates paper and photo orientations with configurable margins and cut spacing,
/// centering the resulting photo grid on the page.
pub fn compute_layout(
    id_size: &IdPhotoSize,
    paper: &PaperSize,
    dpi: u32,
    margin_inches: f64,
) -> PrintLayout {
    let gap_inches = 0.06; // Spacing between photos for cut lines

    // Candidate 1: Natural paper orientation, standard photo
    let c1 = evaluate_candidate(
        paper.width_inches,
        paper.height_inches,
        id_size.width_inches,
        id_size.height_inches,
        margin_inches,
        gap_inches,
        if paper.width_inches <= paper.height_inches { "portrait" } else { "landscape" },
    );

    // Candidate 2: Rotated 90° paper orientation, standard photo
    let c2 = evaluate_candidate(
        paper.height_inches,
        paper.width_inches,
        id_size.width_inches,
        id_size.height_inches,
        margin_inches,
        gap_inches,
        if paper.height_inches <= paper.width_inches { "portrait" } else { "landscape" },
    );

    // Select candidate maximizing total photo yield
    let best = if c2.total > c1.total { c2 } else { c1 };

    let paper_width_px = (best.page_w * dpi as f64).round() as u32;
    let paper_height_px = (best.page_h * dpi as f64).round() as u32;
    let photo_width_px = (best.photo_w * dpi as f64).round() as u32;
    let photo_height_px = (best.photo_h * dpi as f64).round() as u32;
    let gap_px = (gap_inches * dpi as f64).round() as u32;

    // Center grid on paper
    let grid_w = if best.cols > 0 {
        best.cols * photo_width_px + (best.cols.saturating_sub(1)) * gap_px
    } else {
        0
    };
    let grid_h = if best.rows > 0 {
        best.rows * photo_height_px + (best.rows.saturating_sub(1)) * gap_px
    } else {
        0
    };

    let start_x = paper_width_px.saturating_sub(grid_w) / 2;
    let start_y = paper_height_px.saturating_sub(grid_h) / 2;

    let mut positions = Vec::with_capacity((best.cols * best.rows) as usize);
    for r in 0..best.rows {
        for c in 0..best.cols {
            let x_offset = start_x + c * (photo_width_px + gap_px);
            let y_offset = start_y + r * (photo_height_px + gap_px);
            positions.push(PhotoPosition {
                row: r,
                col: c,
                x_offset,
                y_offset,
                width: photo_width_px,
                height: photo_height_px,
            });
        }
    }

    PrintLayout {
        paper_name: paper.name.to_string(),
        id_size_name: id_size.name.to_string(),
        paper_width_px,
        paper_height_px,
        photo_width_px,
        photo_height_px,
        cols: best.cols,
        rows: best.rows,
        total_photos: best.total,
        positions,
        dpi,
        orientation: best.orientation.to_string(),
    }
}

fn evaluate_candidate(
    page_w: f64,
    page_h: f64,
    photo_w: f64,
    photo_h: f64,
    margin: f64,
    gap: f64,
    orientation: &'static str,
) -> LayoutCandidate {
    let avail_w = (page_w - 2.0 * margin).max(0.0);
    let avail_h = (page_h - 2.0 * margin).max(0.0);

    let cols = if avail_w >= photo_w {
        (((avail_w + gap) / (photo_w + gap)).floor() as u32).max(1)
    } else {
        0
    };

    let rows = if avail_h >= photo_h {
        (((avail_h + gap) / (photo_h + gap)).floor() as u32).max(1)
    } else {
        0
    };

    let total = cols * rows;

    LayoutCandidate {
        page_w,
        page_h,
        photo_w,
        photo_h,
        cols,
        rows,
        total,
        orientation,
    }
}

/// Renders a full high-resolution print sheet with ID photos tiled according to `layout`.
///
/// Applies non-destructive crop and adjustments from `AppState`, resamples each photo
/// using high-fidelity Lanczos3 interpolation, and draws subtle cutting guidelines.
pub fn render_print_sheet(
    source: &DynamicImage,
    state: &AppState,
    layout: &PrintLayout,
    _dpi: u32,
) -> Result<DynamicImage, RenderError> {
    // 1. Prepare base cropped image
    let cropped = if state.crop.active && state.crop.width > 0 && state.crop.height > 0 {
        let (w, h) = source.dimensions();
        let x = state.crop.x.min(w);
        let y = state.crop.y.min(h);
        let cw = state.crop.width.min(w.saturating_sub(x));
        let ch = state.crop.height.min(h.saturating_sub(y));
        if cw > 0 && ch > 0 {
            source.crop_imm(x, y, cw, ch)
        } else {
            source.clone()
        }
    } else {
        source.clone()
    };

    // 2. High-quality resize to target ID photo resolution
    let resized = cropped.resize_exact(
        layout.photo_width_px,
        layout.photo_height_px,
        image::imageops::FilterType::Lanczos3,
    );

    // 3. Apply color adjustments
    let mut photo_rgba = resized.to_rgba8();
    if !state.adjustments.is_identity() {
        apply_all_adjustments(
            &mut photo_rgba,
            state.adjustments.brightness,
            state.adjustments.exposure,
            state.adjustments.gamma,
        );
    }

    // 4. Create blank white print sheet
    let mut sheet = RgbaImage::from_pixel(
        layout.paper_width_px,
        layout.paper_height_px,
        Rgba([255, 255, 255, 255]),
    );

    // 5. Tile photos onto sheet and draw hairline cut borders
    let guide_color = Rgba([225, 225, 225, 255]); // Subtle gray cut mark

    for pos in &layout.positions {
        image::imageops::overlay(&mut sheet, &photo_rgba, pos.x_offset as i64, pos.y_offset as i64);

        // Draw 1px cut line boundary around photo for trimming precision
        draw_border_rect(
            &mut sheet,
            pos.x_offset,
            pos.y_offset,
            pos.width,
            pos.height,
            guide_color,
        );
    }

    Ok(DynamicImage::ImageRgba8(sheet))
}

/// Draw a single-pixel outline around the rectangle for cutting guidelines.
fn draw_border_rect(
    image: &mut RgbaImage,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    color: Rgba<u8>,
) {
    let right = (x + width).saturating_sub(1).min(image.width().saturating_sub(1));
    let bottom = (y + height).saturating_sub(1).min(image.height().saturating_sub(1));

    // Top and bottom horizontal edges
    for px in x..=right {
        if px < image.width() {
            if y < image.height() {
                image.put_pixel(px, y, color);
            }
            if bottom < image.height() {
                image.put_pixel(px, bottom, color);
            }
        }
    }

    // Left and right vertical edges
    for py in y..=bottom {
        if py < image.height() {
            if x < image.width() {
                image.put_pixel(x, py, color);
            }
            if right < image.width() {
                image.put_pixel(right, py, color);
            }
        }
    }
}
