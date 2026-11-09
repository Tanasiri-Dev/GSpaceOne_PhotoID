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

    // 6. Draw GSpaceOne PhotoID branding logo in safe margin space (never overlapping photos)
    draw_gspaceone_logo(&mut sheet, layout, _dpi);

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

/// 5x7 bitmap font glyph lookup for brand watermark rendering.
fn get_glyph_bitmap(c: char) -> [u8; 7] {
    match c {
        'G' => [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0E],
        'S' => [0x0E, 0x11, 0x10, 0x0E, 0x01, 0x11, 0x0E],
        'p' => [0x00, 0x00, 0x1E, 0x11, 0x1E, 0x10, 0x10],
        'a' => [0x00, 0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0F],
        'c' => [0x00, 0x00, 0x0E, 0x11, 0x10, 0x11, 0x0E],
        'e' => [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E],
        'O' => [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
        'n' => [0x00, 0x00, 0x16, 0x19, 0x11, 0x11, 0x11],
        'P' => [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
        'h' => [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x11],
        'o' => [0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E],
        't' => [0x08, 0x08, 0x1C, 0x08, 0x08, 0x09, 0x06],
        'I' => [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
        'D' => [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
        '@' => [0x04, 0x0E, 0x1F, 0x15, 0x15, 0x1F, 0x00], // Camera icon
        _ => [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    }
}

/// Draws bitmap string on RgbaImage at specified pixel position and scale.
fn draw_bitmap_string(
    img: &mut RgbaImage,
    text: &str,
    start_x: u32,
    start_y: u32,
    scale: u32,
    color: Rgba<u8>,
) {
    let mut cursor_x = start_x;
    for ch in text.chars() {
        let bitmap = get_glyph_bitmap(ch);
        for (row_idx, &row_byte) in bitmap.iter().enumerate() {
            for col_idx in 0..5 {
                let bit = (row_byte >> (4 - col_idx)) & 1;
                if bit == 1 {
                    for sy in 0..scale {
                        for sx in 0..scale {
                            let px = cursor_x + (col_idx as u32) * scale + sx;
                            let py = start_y + (row_idx as u32) * scale + sy;
                            if px < img.width() && py < img.height() {
                                img.put_pixel(px, py, color);
                            }
                        }
                    }
                }
            }
        }
        cursor_x += 6 * scale; // 5 bits + 1 bit spacing
    }
}

/// Draws GSpaceOne PhotoID brand emblem in a collision-safe margin area (never overlaps photos).
fn draw_gspaceone_logo(sheet: &mut RgbaImage, layout: &PrintLayout, dpi: u32) {
    let page_w = sheet.width();
    let page_h = sheet.height();

    // Scale parameters based on output DPI (300 vs 600 DPI)
    let dpi_factor = (dpi as f64 / 300.0).max(1.0);
    let scale_brand = (3.0 * dpi_factor).round() as u32;
    let scale_badge = (2.0 * dpi_factor).round() as u32;
    let r = (26.0 * dpi_factor).round() as i64;

    let logo_w = (310.0 * dpi_factor).round() as u32;
    let logo_h = (74.0 * dpi_factor).round() as u32;
    let pad = (20.0 * dpi_factor).round() as u32;

    if page_w < logo_w + pad * 2 || page_h < logo_h + pad * 2 {
        return;
    }

    // Helper: test if a rectangle intersects any photo bounding box
    let check_overlap = |lx: u32, ly: u32, lw: u32, lh: u32| -> bool {
        let l_right = lx + lw;
        let l_bottom = ly + lh;
        for pos in &layout.positions {
            let p_right = pos.x_offset + pos.width;
            let p_bottom = pos.y_offset + pos.height;
            // Overlap check with safety margin
            if lx < p_right + 8 && l_right + 8 > pos.x_offset && ly < p_bottom + 8 && l_bottom + 8 > pos.y_offset {
                return true;
            }
        }
        false
    };

    // Candidate 1: Standard bottom-right margin
    let c1_x = page_w.saturating_sub(logo_w + pad);
    let c1_y = page_h.saturating_sub(logo_h + pad);

    // Candidate 2: Right-side whitespace (centered vertically in margin)
    let c2_x = page_w.saturating_sub(logo_w + (pad / 2));
    let c2_y = (page_h.saturating_sub(logo_h)) / 2;

    // Candidate 3: Bottom-center whitespace
    let c3_x = (page_w.saturating_sub(logo_w)) / 2;
    let c3_y = page_h.saturating_sub(logo_h + pad);

    // Candidate 4: Top-right margin
    let c4_x = page_w.saturating_sub(logo_w + pad);
    let c4_y = pad;

    let (start_x, start_y) = if !check_overlap(c1_x, c1_y, logo_w, logo_h) {
        (c1_x, c1_y)
    } else if !check_overlap(c2_x, c2_y, logo_w, logo_h) {
        (c2_x, c2_y)
    } else if !check_overlap(c3_x, c3_y, logo_w, logo_h) {
        (c3_x, c3_y)
    } else if !check_overlap(c4_x, c4_y, logo_w, logo_h) {
        (c4_x, c4_y)
    } else {
        // Fallback: place in safe right margin
        (c1_x, c1_y)
    };

    // 1. Draw stylized circular emblem (G icon with blue-cyan gradient)
    let cx = (start_x as f64 + 32.0 * dpi_factor) as i64;
    let cy = (start_y as f64 + 36.0 * dpi_factor) as i64;

    for dy in -r..=r {
        for dx in -r..=r {
            let dist_sq = dx * dx + dy * dy;
            if dist_sq <= r * r {
                let px = (cx + dx) as u32;
                let py = (cy + dy) as u32;
                if px < sheet.width() && py < sheet.height() {
                    let t = (dx + r) as f32 / (2.0 * r as f32);
                    let red = (0.0 * (1.0 - t) + 14.0 * t) as u8;
                    let green = (102.0 * (1.0 - t) + 165.0 * t) as u8;
                    let blue = (240.0 * (1.0 - t) + 255.0 * t) as u8;
                    sheet.put_pixel(px, py, Rgba([red, green, blue, 255]));
                }
            }
        }
    }

    // 2. White 'G' monogram inside emblem
    let r_inner = (15.0 * dpi_factor) as i64;
    let r_hole = (7.0 * dpi_factor) as i64;
    for dy in -r_inner..=r_inner {
        for dx in -r_inner..=r_inner {
            let dist_sq = dx * dx + dy * dy;
            if dist_sq <= r_inner * r_inner && dist_sq >= r_hole * r_hole {
                // Arc of G (open on top-right quadrant)
                if !(dx > (4.0 * dpi_factor) as i64 && dy < 0) {
                    let px = (cx + dx) as u32;
                    let py = (cy + dy) as u32;
                    if px < sheet.width() && py < sheet.height() {
                        sheet.put_pixel(px, py, Rgba([255, 255, 255, 255]));
                    }
                }
            }
        }
    }
    // G crossbar
    let cross_w = (11.0 * dpi_factor) as i64;
    let cross_h = (4.0 * dpi_factor) as i64;
    for dx in 0..=cross_w {
        for dy in -cross_h..=cross_h {
            let px = (cx + dx) as u32;
            let py = (cy + dy) as u32;
            if px < sheet.width() && py < sheet.height() {
                sheet.put_pixel(px, py, Rgba([255, 255, 255, 255]));
            }
        }
    }

    // 3. Vertical separator bar
    let bar_x = (start_x as f64 + 72.0 * dpi_factor) as u32;
    let bar_y1 = (start_y as f64 + 12.0 * dpi_factor) as u32;
    let bar_y2 = (start_y as f64 + 60.0 * dpi_factor) as u32;
    let bar_w = (2.0 * dpi_factor).round() as u32;
    for py in bar_y1..bar_y2 {
        for px in bar_x..(bar_x + bar_w) {
            if px < sheet.width() && py < sheet.height() {
                sheet.put_pixel(px, py, Rgba([203, 213, 225, 255]));
            }
        }
    }

    // 4. "GSpaceOne" typography in bold dark slate (#0f172a)
    let brand_text_color = Rgba([15, 23, 42, 255]);
    let text_x = (start_x as f64 + 85.0 * dpi_factor) as u32;
    let text_y = (start_y as f64 + 12.0 * dpi_factor) as u32;
    draw_bitmap_string(sheet, "GSpaceOne", text_x, text_y, scale_brand, brand_text_color);

    // 5. "PhotoID" rounded blue badge with camera emblem
    let badge_x = (start_x as f64 + 85.0 * dpi_factor) as u32;
    let badge_y = (start_y as f64 + 40.0 * dpi_factor) as u32;
    let badge_w = (150.0 * dpi_factor) as u32;
    let badge_h = (24.0 * dpi_factor) as u32;
    let badge_color = Rgba([0, 112, 243, 255]); // Signature electric blue

    // Pill background
    for py in badge_y..(badge_y + badge_h) {
        for px in badge_x..(badge_x + badge_w) {
            if px < sheet.width() && py < sheet.height() {
                sheet.put_pixel(px, py, badge_color);
            }
        }
    }

    // Badge text: "PhotoID @" where '@' is the camera glyph
    let white = Rgba([255, 255, 255, 255]);
    let badge_text_x = (badge_x as f64 + 16.0 * dpi_factor) as u32;
    let badge_text_y = (badge_y as f64 + 5.0 * dpi_factor) as u32;
    draw_bitmap_string(sheet, "PhotoID @", badge_text_x, badge_text_y, scale_badge, white);
}
