use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};

use crate::print_layout::paper::{IdPhotoSize, PaperSize};
use crate::rendering::adjustments::apply_all_adjustments;
use crate::rendering::pipeline::RenderError;
use crate::state::app_state::AppState;

/// Exact pixel placement of a single photo instance on the printed sheet.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub paper_width_mm: f64,
    pub paper_height_mm: f64,
    pub id_width_mm: f64,
    pub id_height_mm: f64,
    pub margin_horizontal_mm: f64,
    pub margin_vertical_mm: f64,
    pub spacing_mm: f64,
}

/// Serializable view of layout parameters sent across Tauri IPC to the frontend UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintLayoutInfo {
    pub id_size: String,
    pub paper_size: String,
    pub photo_count: u32,
    pub columns: u32,
    pub rows: u32,
    pub margin_horizontal_mm: f64,
    pub margin_vertical_mm: f64,
    pub spacing_mm: f64,
    pub id_width_mm: f64,
    pub id_height_mm: f64,
    pub paper_width_mm: f64,
    pub paper_height_mm: f64,
    pub is_landscape: bool,
    pub paper_width_px: u32,
    pub paper_height_px: u32,
    pub photo_width_px: u32,
    pub photo_height_px: u32,
    pub positions: Vec<PhotoPosition>,
}

impl From<&PrintLayout> for PrintLayoutInfo {
    fn from(l: &PrintLayout) -> Self {
        Self {
            id_size: l.id_size_name.clone(),
            paper_size: l.paper_name.clone(),
            photo_count: l.total_photos,
            columns: l.cols,
            rows: l.rows,
            margin_horizontal_mm: l.margin_horizontal_mm,
            margin_vertical_mm: l.margin_vertical_mm,
            spacing_mm: l.spacing_mm,
            id_width_mm: l.id_width_mm,
            id_height_mm: l.id_height_mm,
            paper_width_mm: l.paper_width_mm,
            paper_height_mm: l.paper_height_mm,
            is_landscape: l.orientation == "landscape",
            paper_width_px: l.paper_width_px,
            paper_height_px: l.paper_height_px,
            photo_width_px: l.photo_width_px,
            photo_height_px: l.photo_height_px,
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

    let paper_width_mm = (best.page_w * 25.4 * 10.0).round() / 10.0;
    let paper_height_mm = (best.page_h * 25.4 * 10.0).round() / 10.0;
    let id_width_mm = (best.photo_w * 25.4 * 10.0).round() / 10.0;
    let id_height_mm = (best.photo_h * 25.4 * 10.0).round() / 10.0;
    let margin_horizontal_mm = ((start_x as f64) / (dpi as f64) * 25.4 * 10.0).round() / 10.0;
    let margin_vertical_mm = ((start_y as f64) / (dpi as f64) * 25.4 * 10.0).round() / 10.0;
    let spacing_mm = (gap_inches * 25.4 * 10.0).round() / 10.0;

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
        paper_width_mm,
        paper_height_mm,
        id_width_mm,
        id_height_mm,
        margin_horizontal_mm,
        margin_vertical_mm,
        spacing_mm,
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

/// Embedded official brand logo PNG for sheet stamping.
const BRAND_LOGO_BYTES: &[u8] = include_bytes!("../../../resources/brand/GSpaceOne_PhotoID_Logo.png");

/// Renders a full high-resolution print sheet with ID photos tiled according to `layout`.
///
/// Applies non-destructive crop and adjustments from `AppState`, resamples each photo
/// using high-fidelity Lanczos3 interpolation, and draws subtle cutting guidelines.
pub fn render_print_sheet(
    source: &DynamicImage,
    state: &AppState,
    layout: &PrintLayout,
    _dpi: u32,
    show_logo: bool,
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

    // 5. Tile photos onto sheet and draw corner cut guidelines
    let cut_mark_color = Rgba([148, 163, 184, 255]); // Clean steel slate (#94a3b8)
    let cut_mark_len = (20.0 * (_dpi as f64) / 300.0).round() as u32;

    for pos in &layout.positions {
        image::imageops::overlay(&mut sheet, &photo_rgba, pos.x_offset as i64, pos.y_offset as i64);

        // Draw L-shaped corner crop/cut marks around each photo
        draw_corner_cut_marks(
            &mut sheet,
            pos.x_offset,
            pos.y_offset,
            pos.width,
            pos.height,
            cut_mark_color,
            cut_mark_len,
        );
    }

    // 6. Draw GSpaceOne PhotoID branding logo in safe margin space (never overlapping photos) if enabled
    if show_logo {
        draw_gspaceone_logo(&mut sheet, layout, _dpi);
    }

    Ok(DynamicImage::ImageRgba8(sheet))
}

/// Draw L-shaped corner cut marks around each photo instance for trimming precision.
fn draw_corner_cut_marks(
    image: &mut RgbaImage,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    color: Rgba<u8>,
    mark_len: u32,
) {
    let right = x + width;
    let bottom = y + height;
    let img_w = image.width();
    let img_h = image.height();
    let len = mark_len as i64;
    let x0 = x as i64;
    let y0 = y as i64;
    let x1 = right as i64;
    let y1 = bottom as i64;

    let draw_hline = |img: &mut RgbaImage, x_start: i64, x_end: i64, py: i64| {
        if py >= 0 && (py as u32) < img_h {
            for px in x_start..=x_end {
                if px >= 0 && (px as u32) < img_w {
                    img.put_pixel(px as u32, py as u32, color);
                }
            }
        }
    };

    let draw_vline = |img: &mut RgbaImage, px: i64, y_start: i64, y_end: i64| {
        if px >= 0 && (px as u32) < img_w {
            for py in y_start..=y_end {
                if py >= 0 && (py as u32) < img_h {
                    img.put_pixel(px as u32, py as u32, color);
                }
            }
        }
    };

    // Top-Left corner
    draw_hline(image, x0 - len, x0, y0);
    draw_vline(image, x0, y0 - len, y0);

    // Top-Right corner
    draw_hline(image, x1, x1 + len, y0);
    draw_vline(image, x1, y0 - len, y0);

    // Bottom-Left corner
    draw_hline(image, x0 - len, x0, y1);
    draw_vline(image, x0, y1, y1 + len);

    // Bottom-Right corner
    draw_hline(image, x1, x1 + len, y1);
    draw_vline(image, x1, y1, y1 + len);
}

/// Draws the official GSpaceOne PhotoID brand logo (from GSpaceOne_PhotoID_Logo.png)
/// in safe margin whitespace strictly outside all photo cells and cut guidelines.
pub fn draw_gspaceone_logo(sheet: &mut RgbaImage, layout: &PrintLayout, dpi: u32) {
    let logo_img = match image::load_from_memory(BRAND_LOGO_BYTES) {
        Ok(img) => img,
        Err(e) => {
            log::warn!("Failed to load embedded brand logo: {e}");
            return;
        }
    };

    let sheet_w = sheet.width();
    let sheet_h = sheet.height();

    // Find bounding box extremes across all positioned photo cells
    let max_photo_y = layout.positions.iter().map(|p| p.y_offset + p.height).max().unwrap_or(0);
    let min_photo_y = layout.positions.iter().map(|p| p.y_offset).min().unwrap_or(0);
    let max_photo_x = layout.positions.iter().map(|p| p.x_offset + p.width).max().unwrap_or(0);

    // Cut marks extend outside photo boundary
    let cut_mark_len = (20.0 * (dpi as f64) / 300.0).round() as u32;
    let safety_margin = cut_mark_len + (12.0 * (dpi as f64) / 300.0).round() as u32;

    let safe_bottom_start = max_photo_y + safety_margin;
    let safe_top_limit = min_photo_y.saturating_sub(safety_margin);
    let safe_right_start = max_photo_x + safety_margin;

    let bottom_space = sheet_h.saturating_sub(safe_bottom_start);
    let right_space = sheet_w.saturating_sub(safe_right_start);
    let top_space = safe_top_limit;

    let orig_w = logo_img.width() as f64;
    let orig_h = logo_img.height() as f64;
    let aspect = orig_w / orig_h; // ~3.725

    // Standard target height: ~5.5mm (65px at 300 DPI, 130px at 600 DPI)
    let base_h = (65.0 * (dpi as f64) / 300.0).round() as u32;

    // Determine candidate location with zero photo overlap
    let (target_w, target_h, pos_x, pos_y) = if bottom_space >= base_h + 10 {
        // Option 1: Bottom whitespace (centered or aligned with safe margin)
        let h = base_h.min(bottom_space.saturating_sub(10));
        let w = (h as f64 * aspect).round() as u32;
        let x = if sheet_w > w + 40 {
            sheet_w - w - (sheet_w - max_photo_x).max(20).min(sheet_w / 4)
        } else {
            (sheet_w.saturating_sub(w)) / 2
        };
        let y = safe_bottom_start + (bottom_space.saturating_sub(h)) / 2;
        (w, h, x, y)
    } else if right_space >= (base_h as f64 * aspect).round() as u32 + 10 {
        // Option 2: Right-side whitespace
        let w = (base_h as f64 * aspect).round() as u32;
        let h = base_h;
        let x = safe_right_start + (right_space.saturating_sub(w)) / 2;
        let y = (sheet_h.saturating_sub(h)) / 2;
        (w, h, x, y)
    } else if top_space >= base_h + 10 {
        // Option 3: Top margin whitespace
        let h = base_h.min(top_space.saturating_sub(10));
        let w = (h as f64 * aspect).round() as u32;
        let x = (sheet_w.saturating_sub(w)) / 2;
        let y = (top_space.saturating_sub(h)) / 2;
        (w, h, x, y)
    } else if bottom_space >= 30 {
        // Option 4: Scaled down in bottom whitespace
        let h = bottom_space.saturating_sub(8);
        let w = (h as f64 * aspect).round() as u32;
        let x = (sheet_w.saturating_sub(w)) / 2;
        let y = safe_bottom_start + 4;
        (w, h, x, y)
    } else {
        // If sheet is completely packed with no margins, skip drawing to avoid ANY overlap
        return;
    };

    if target_w == 0 || target_h == 0 {
        return;
    }

    // High quality Lanczos3 resize of the official logo
    let resized_logo = logo_img.resize_exact(target_w, target_h, image::imageops::FilterType::Lanczos3);
    let logo_rgba = resized_logo.to_rgba8();

    // Composite official logo onto sheet in whitespace
    image::imageops::overlay(sheet, &logo_rgba, pos_x as i64, pos_y as i64);
}
