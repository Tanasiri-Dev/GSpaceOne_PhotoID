use std::sync::Arc;
use base64::prelude::*;
use log::info;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::print_layout::paper::{find_id_size, find_paper, ID_SIZES, PAPER_SIZES};
use crate::print_layout::spooler::{compute_layout, render_print_sheet, PrintLayoutInfo};
use crate::rendering::gpu_compute::GpuComputeEngine;
use crate::rendering::pipeline::render_preview_with_gpu;
use crate::state::app_state::{CropRegion, ImageAdjustments, SharedAppState};
use crate::workers::pool::WorkerPool;

/// Information response for available paper and ID photo size options.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupportedSizesInfo {
    pub papers: Vec<String>,
    pub id_sizes: Vec<String>,
}

/// Information response for detected system printers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterListInfo {
    pub default_printer: String,
    pub printers: Vec<String>,
}

/// Result returned to frontend upon successfully loading an image.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadImageResult {
    pub preview_data: String,
    pub width: u32,
    pub height: u32,
}

/// Helper function to render the current state to a base64-encoded PNG preview.
fn render_state_preview_base64(
    state: &SharedAppState,
    gpu: Option<&GpuComputeEngine>,
) -> Result<String, String> {
    let state_guard = state.read();
    let bytes = render_preview_with_gpu(&state_guard, gpu, 1280)
        .map_err(|e| format!("Preview render failed: {e}"))?;
    Ok(BASE64_STANDARD.encode(&bytes))
}

/// 1. Load an image from disk, cache it in application state, and return a base64 preview with dimensions.
#[tauri::command]
pub async fn load_image(
    state: State<'_, SharedAppState>,
    pool: State<'_, Arc<WorkerPool>>,
    gpu: State<'_, Arc<Option<GpuComputeEngine>>>,
    path: String,
) -> Result<LoadImageResult, String> {
    info!("Loading image from path: {path}");
    let pool = pool.inner().clone();
    let state = state.inner().clone();
    let gpu = gpu.inner().clone();

    pool.spawn_blocking(move || {
        let loaded = image::open(&path).map_err(|e| format!("Failed to open image at '{path}': {e}"))?;
        let width = loaded.width();
        let height = loaded.height();
        {
            let mut state_guard = state.write();
            state_guard.set_image(loaded);
        }
        let preview_data = render_state_preview_base64(&state, gpu.as_ref().as_ref())?;
        Ok(LoadImageResult {
            preview_data,
            width,
            height,
        })
    })
}

/// 2. Apply non-destructive color adjustments and return an updated base64 preview.
#[tauri::command]
pub async fn apply_adjustments(
    state: State<'_, SharedAppState>,
    pool: State<'_, Arc<WorkerPool>>,
    gpu: State<'_, Arc<Option<GpuComputeEngine>>>,
    brightness: f32,
    exposure: f32,
    gamma: f32,
) -> Result<String, String> {
    let pool = pool.inner().clone();
    let state = state.inner().clone();
    let gpu = gpu.inner().clone();

    pool.spawn_blocking(move || {
        {
            let mut state_guard = state.write();
            state_guard.set_adjustments(brightness, exposure, gamma);
        }
        render_state_preview_base64(&state, gpu.as_ref().as_ref())
    })
}

/// 3. Store non-destructive crop region in state and return an updated base64 preview.
#[tauri::command]
pub async fn set_crop(
    state: State<'_, SharedAppState>,
    pool: State<'_, Arc<WorkerPool>>,
    gpu: State<'_, Arc<Option<GpuComputeEngine>>>,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let pool = pool.inner().clone();
    let state = state.inner().clone();
    let gpu = gpu.inner().clone();

    pool.spawn_blocking(move || {
        {
            let mut state_guard = state.write();
            if width == 0 || height == 0 {
                state_guard.reset_crop();
            } else {
                state_guard.set_crop(x, y, width, height);
            }
        }
        render_state_preview_base64(&state, gpu.as_ref().as_ref())
    })
}

/// 4. Calculate auto-tiling grid layout for given ID and paper size.
#[tauri::command]
pub fn get_print_layout(
    id_size: String,
    paper_size: String,
) -> Result<PrintLayoutInfo, String> {
    let id_spec = find_id_size(&id_size).ok_or_else(|| {
        format!(
            "Unknown ID size '{}'. Supported: 1inch, 1.5inch, 2inch, 2.5inch",
            id_size
        )
    })?;

    let paper_spec = find_paper(&paper_size).ok_or_else(|| {
        format!(
            "Unknown paper size '{}'. Supported: 4x6, 5x7, A4, Letter",
            paper_size
        )
    })?;

    let layout = compute_layout(id_spec, paper_spec, 300, 0.15);
    Ok(PrintLayoutInfo::from(&layout))
}

/// 5. Render full high-resolution sheet and trigger native OS print spooler.
#[tauri::command]
pub async fn execute_print(
    state: State<'_, SharedAppState>,
    pool: State<'_, Arc<WorkerPool>>,
    id_size: String,
    paper_size: String,
    show_logo: Option<bool>,
    photo_count: Option<u32>,
) -> Result<String, String> {
    let pool = pool.inner().clone();
    let state = state.inner().clone();

    pool.spawn_blocking(move || {
        let (source_img, state_snapshot) = {
            let guard = state.read();
            let img = guard
                .source_image
                .as_ref()
                .ok_or_else(|| "Cannot print: No source image loaded in state".to_string())?
                .clone();
            let snapshot = crate::state::app_state::AppState {
                source_image: None,
                preview_base: None,
                adjustments: guard.adjustments,
                crop: guard.crop,
                gpu_available: false,
            };
            (img, snapshot)
        };

        let id_spec = find_id_size(&id_size).ok_or_else(|| format!("Unknown ID size: '{id_size}'"))?;
        let paper_spec = find_paper(&paper_size).ok_or_else(|| format!("Unknown paper size: '{paper_size}'"))?;

        info!(
            "Rendering print sheet: ID size {:?}, Paper size {:?}, photo count: {:?}",
            id_spec.name, paper_spec.name, photo_count
        );

        let layout = compute_layout(id_spec, paper_spec, 300, 0.15);
        let show_brand_logo = show_logo.unwrap_or(true);
        let sheet = render_print_sheet(&source_img, &state_snapshot, &layout, 300, show_brand_logo, photo_count)
            .map_err(|e| format!("Failed to render print sheet: {e}"))?;

        // Save sheet to temporary directory for OS print spooler
        let temp_filename = format!("gspaceone_photoid_print_{}.png", uuid::Uuid::new_v4());
        let temp_path = std::env::temp_dir().join(&temp_filename);
        sheet
            .save(&temp_path)
            .map_err(|e| format!("Failed to save print spool file to '{}': {e}", temp_path.display()))?;

        info!("Print sheet written to temporary file: {}", temp_path.display());

        let paper_w_in = layout.paper_width_mm / 25.4;
        let paper_h_in = layout.paper_height_mm / 25.4;
        let is_landscape = layout.orientation == "landscape";

        // Dispatch to native operating system print API with physical dimension calibration
        dispatch_native_print(&temp_path, paper_w_in, paper_h_in, is_landscape, 300)?;

        let rendered_count = photo_count.unwrap_or(layout.total_photos).min(layout.total_photos);
        Ok(format!(
            "Print sheet successfully spooled: {} photos on {} ({})",
            rendered_count, layout.paper_name, temp_path.display()
        ))
    })
}

/// 5b. Render full 600 DPI ultra-high-resolution sheet with crop marks and GSpaceOne logo, saving to file.
#[tauri::command]
pub async fn save_high_quality_image(
    state: State<'_, SharedAppState>,
    pool: State<'_, Arc<WorkerPool>>,
    id_size: String,
    paper_size: String,
    output_path: String,
    show_logo: Option<bool>,
    photo_count: Option<u32>,
) -> Result<String, String> {
    let pool = pool.inner().clone();
    let state = state.inner().clone();

    pool.spawn_blocking(move || {
        let (source_img, state_snapshot) = {
            let guard = state.read();
            let img = guard
                .source_image
                .as_ref()
                .ok_or_else(|| "No source image loaded to export".to_string())?
                .clone();
            let snapshot = crate::state::app_state::AppState {
                source_image: None,
                preview_base: None,
                adjustments: guard.adjustments,
                crop: guard.crop,
                gpu_available: false,
            };
            (img, snapshot)
        };

        let id_spec = find_id_size(&id_size).ok_or_else(|| format!("Unknown ID size: '{id_size}'"))?;
        let paper_spec = find_paper(&paper_size).ok_or_else(|| format!("Unknown paper size: '{paper_size}'"))?;

        // Render at 600 DPI for commercial photo lab printing quality
        let layout = compute_layout(id_spec, paper_spec, 600, 0.15);
        let show_brand_logo = show_logo.unwrap_or(true);
        let sheet = render_print_sheet(&source_img, &state_snapshot, &layout, 600, show_brand_logo, photo_count)
            .map_err(|e| format!("Failed to render 600 DPI print sheet: {e}"))?;

        sheet
            .save(&output_path)
            .map_err(|e| format!("Failed to save image to '{output_path}': {e}"))?;

        info!("High quality 600 DPI print sheet saved to: {output_path}");
        Ok(format!("High quality 600 DPI print sheet saved to {output_path}"))
    })
}

/// 6. Create or display the detachable/floating Settings window.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    info!("Opening detachable settings window...");
    if let Some(window) = app.get_webview_window("settings") {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        let _window = WebviewWindowBuilder::new(
            &app,
            "settings",
            WebviewUrl::App("index.html".into()),
        )
        .title("Settings")
        .inner_size(380.0, 680.0)
        .resizable(true)
        .always_on_top(true)
        .decorations(true)
        .build()
        .map_err(|e| format!("Failed to build settings window: {e}"))?;
    }
    Ok(())
}

/// 6b. Close or hide the detachable Settings window.
#[tauri::command]
pub async fn close_settings_window(app: AppHandle) -> Result<(), String> {
    info!("Closing detachable settings window...");
    if let Some(window) = app.get_webview_window("settings") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 7. Reset all color adjustments to defaults and return updated base64 preview.
#[tauri::command]
pub async fn reset_adjustments(
    state: State<'_, SharedAppState>,
    pool: State<'_, Arc<WorkerPool>>,
    gpu: State<'_, Arc<Option<GpuComputeEngine>>>,
) -> Result<String, String> {
    let pool = pool.inner().clone();
    let state = state.inner().clone();
    let gpu = gpu.inner().clone();

    pool.spawn_blocking(move || {
        {
            let mut state_guard = state.write();
            state_guard.reset_adjustments();
        }
        render_state_preview_base64(&state, gpu.as_ref().as_ref())
    })
}

/// Helper command to inspect current adjustments.
#[tauri::command]
pub fn get_adjustments(state: State<'_, SharedAppState>) -> Result<ImageAdjustments, String> {
    Ok(state.read().clone_adjustments())
}

/// Helper command to inspect current crop region.
#[tauri::command]
pub fn get_crop(state: State<'_, SharedAppState>) -> Result<CropRegion, String> {
    Ok(state.read().clone_crop())
}

/// Helper command to list all supported paper and photo sizes.
#[tauri::command]
pub fn get_supported_sizes() -> Result<SupportedSizesInfo, String> {
    Ok(SupportedSizesInfo {
        papers: PAPER_SIZES.iter().map(|p| p.name.to_string()).collect(),
        id_sizes: ID_SIZES.iter().map(|s| s.name.to_string()).collect(),
    })
}

/// Query installed printers from the operating system.
#[tauri::command]
pub fn get_printers() -> Result<PrinterListInfo, String> {
    #[cfg(target_os = "windows")]
    {
        let ps_code = "Add-Type -AssemblyName System.Drawing; [PSCustomObject]@{ defaultPrinter = (New-Object System.Drawing.Printing.PrinterSettings).PrinterName; printers = @([System.Drawing.Printing.PrinterSettings]::InstalledPrinters) } | ConvertTo-Json";
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", ps_code])
            .output()
            .map_err(|e| format!("Failed to query Windows printers: {e}"))?;

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            if let Ok(info) = serde_json::from_str::<PrinterListInfo>(&text) {
                return Ok(info);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("lpstat").args(["-p", "-d"]).output() {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut printers = Vec::new();
            let mut default_printer = String::new();
            for line in text.lines() {
                if line.starts_with("printer ") {
                    if let Some(p_name) = line.split_whitespace().nth(1) {
                        printers.push(p_name.to_string());
                    }
                } else if line.starts_with("system default destination: ") {
                    if let Some(d_name) = line.split(": ").nth(1) {
                        default_printer = d_name.trim().to_string();
                    }
                }
            }
            if !printers.is_empty() {
                if default_printer.is_empty() {
                    default_printer = printers[0].clone();
                }
                return Ok(PrinterListInfo { default_printer, printers });
            }
        }
    }

    // Fallback default list
    Ok(PrinterListInfo {
        default_printer: "System Default Printer".to_string(),
        printers: vec![
            "System Default Printer".to_string(),
            "Microsoft Print to PDF".to_string(),
        ],
    })
}

/// Direct print submission to a specific printer using native OS spooler.
#[tauri::command]
pub async fn print_sheet_direct(
    pool: State<'_, Arc<WorkerPool>>,
    printer_name: Option<String>,
    copies: Option<u32>,
    is_landscape: Option<bool>,
    paper_width_in: Option<f64>,
    paper_height_in: Option<f64>,
    dpi: Option<u32>,
    image_base64: String,
) -> Result<String, String> {
    let pool = pool.inner().clone();
    pool.spawn_blocking(move || {
        // Strip data:image/...;base64, prefix if present
        let raw_base64 = if let Some(idx) = image_base64.find("base64,") {
            &image_base64[idx + 7..]
        } else {
            &image_base64
        };

        let image_bytes = BASE64_STANDARD
            .decode(raw_base64.trim())
            .map_err(|e| format!("Invalid base64 image data: {e}"))?;

        let temp_filename = format!("gspaceone_photoid_print_{}.png", uuid::Uuid::new_v4());
        let temp_path = std::env::temp_dir().join(&temp_filename);
        std::fs::write(&temp_path, image_bytes)
            .map_err(|e| format!("Failed to write temporary print spool file: {e}"))?;

        let target_printer = printer_name.unwrap_or_default();
        let num_copies = copies.unwrap_or(1).max(1);
        let landscape_bool = is_landscape.unwrap_or(false);
        let p_dpi = dpi.unwrap_or(300);
        let w_in = paper_width_in.unwrap_or(4.0);
        let h_in = paper_height_in.unwrap_or(6.0);

        info!(
            "Dispatching print job to '{}' (copies: {}, landscape: {}, paper: {}x{} in, dpi: {})",
            target_printer, num_copies, landscape_bool, w_in, h_in, p_dpi
        );

        #[cfg(target_os = "windows")]
        {
            let target_w_hundredths = (w_in * 100.0).round() as i32;
            let target_h_hundredths = (h_in * 100.0).round() as i32;

            let script = format!(
                r#"
Add-Type -AssemblyName System.Drawing
$doc = New-Object System.Drawing.Printing.PrintDocument
if ('{printer}' -ne '' -and '{printer}' -ne 'System Default Printer') {{
    $doc.PrinterSettings.PrinterName = '{printer}'
}}
$doc.PrinterSettings.Copies = {copies}
$doc.DefaultPageSettings.Landscape = ${landscape}
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false

# Match printer hardware paper size
$tw = {target_w_hundredths}
$th = {target_h_hundredths}
$matched = $null
foreach ($ps in $doc.PrinterSettings.PaperSizes) {{
    if (($ps.Width -ge $tw - 25 -and $ps.Width -le $tw + 25 -and $ps.Height -ge $th - 25 -and $ps.Height -le $th + 25) -or
        ($ps.Width -ge $th - 25 -and $ps.Width -le $th + 25 -and $ps.Height -ge $tw - 25 -and $ps.Height -le $tw + 25)) {{
        $matched = $ps
        break
    }}
}}
if ($matched -ne $null) {{
    $doc.DefaultPageSettings.PaperSize = $matched
}}

$image = [System.Drawing.Image]::FromFile('{file_path}')
if ($image -is [System.Drawing.Bitmap]) {{
    $image.SetResolution({dpi}, {dpi})
}}

$doc.add_PrintPage({{
    param($s, $ev)
    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ev.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $ev.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # Render exact physical bounds on paper in 1/100 inch
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $tw, $th)
    if (${landscape}) {{
        $destRect = New-Object System.Drawing.Rectangle(0, 0, $th, $tw)
    }}

    $ev.Graphics.DrawImage($image, $destRect)
    $ev.HasMorePages = $false
}})
$doc.Print()
$image.Dispose()
$doc.Dispose()
"#,
                printer = target_printer.replace('\'', "''"),
                copies = num_copies,
                landscape = landscape_bool,
                target_w_hundredths = target_w_hundredths,
                target_h_hundredths = target_h_hundredths,
                dpi = p_dpi,
                file_path = temp_path.display().to_string().replace('\'', "''"),
            );

            let output = std::process::Command::new("powershell")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
                .output()
                .map_err(|e| format!("Failed to execute Windows print spooler: {e}"))?;

            let _ = std::fs::remove_file(&temp_path);

            if !output.status.success() {
                let err_msg = String::from_utf8_lossy(&output.stderr);
                return Err(format!("Print spooler error: {err_msg}"));
            }
        }

        #[cfg(target_os = "macos")]
        {
            let mut cmd = std::process::Command::new("lpr");
            if !target_printer.is_empty() && target_printer != "System Default Printer" {
                cmd.arg("-P").arg(&target_printer);
            }
            cmd.arg(format!("-#{}", num_copies));
            cmd.arg(temp_path.to_str().unwrap());
            let status = cmd.status().map_err(|e| format!("Failed to execute lpr: {e}"))?;
            let _ = std::fs::remove_file(&temp_path);
            if !status.success() {
                return Err("lpr command returned error status".to_string());
            }
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            let mut cmd = std::process::Command::new("lpr");
            cmd.arg(temp_path.to_str().unwrap());
            let _ = cmd.status();
            let _ = std::fs::remove_file(&temp_path);
        }

        Ok(format!(
            "Print job successfully queued for '{}' ({} {})",
            if target_printer.is_empty() { "Default Printer" } else { &target_printer },
            num_copies,
            if num_copies == 1 { "copy" } else { "copies" }
        ))
    })
}

/// Dispatches image to native OS printing subsystem via .NET PrintDocument on Windows.
fn dispatch_native_print(
    path: &std::path::Path,
    paper_w_in: f64,
    paper_h_in: f64,
    is_landscape: bool,
    dpi: u32,
) -> Result<(), String> {
    let path_str = path.to_str().ok_or_else(|| "Invalid print file path".to_string())?;

    #[cfg(target_os = "windows")]
    {
        let target_w_hundredths = (paper_w_in * 100.0).round() as i32;
        let target_h_hundredths = (paper_h_in * 100.0).round() as i32;

        let script = format!(
            r#"
Add-Type -AssemblyName System.Drawing
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.DefaultPageSettings.Landscape = ${landscape}
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$doc.OriginAtMargins = $false

$tw = {target_w_hundredths}
$th = {target_h_hundredths}
$matched = $null
foreach ($ps in $doc.PrinterSettings.PaperSizes) {{
    if (($ps.Width -ge $tw - 25 -and $ps.Width -le $tw + 25 -and $ps.Height -ge $th - 25 -and $ps.Height -le $th + 25) -or
        ($ps.Width -ge $th - 25 -and $ps.Width -le $th + 25 -and $ps.Height -ge $tw - 25 -and $ps.Height -le $tw + 25)) {{
        $matched = $ps
        break
    }}
}}
if ($matched -ne $null) {{
    $doc.DefaultPageSettings.PaperSize = $matched
}}

$image = [System.Drawing.Image]::FromFile('{file_path}')
if ($image -is [System.Drawing.Bitmap]) {{
    $image.SetResolution({dpi}, {dpi})
}}

$doc.add_PrintPage({{
    param($s, $ev)
    $ev.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $ev.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $ev.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $tw, $th)
    if (${landscape}) {{
        $destRect = New-Object System.Drawing.Rectangle(0, 0, $th, $tw)
    }}

    $ev.Graphics.DrawImage($image, $destRect)
    $ev.HasMorePages = $false
}})
$doc.Print()
$image.Dispose()
$doc.Dispose()
"#,
            landscape = is_landscape,
            target_w_hundredths = target_w_hundredths,
            target_h_hundredths = target_h_hundredths,
            dpi = dpi,
            file_path = path_str.replace('\'', "''"),
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .output()
            .map_err(|e| format!("Failed to execute PowerShell print spooler: {e}"))?;

        if !output.status.success() {
            let err_msg = String::from_utf8_lossy(&output.stderr);
            log::warn!("PowerShell print spooler warning: {err_msg}");
        }
    }

    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("lpr")
            .arg(path_str)
            .status();

        if status.is_err() || !status.as_ref().unwrap().success() {
            let _ = std::process::Command::new("open")
                .args(["-a", "Preview", path_str])
                .status();
        }
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = std::process::Command::new("lpr")
            .arg(path_str)
            .status();
    }

    Ok(())
}

/// Metadata and EXIF information extracted from an image file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMetadataInfo {
    pub file_path: String,
    pub file_name: String,
    pub file_size_formatted: String,
    pub width: u32,
    pub height: u32,
    pub megapixels: String,
    pub aspect_ratio: String,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub iso: Option<String>,
    pub shutter_speed: Option<String>,
    pub aperture: Option<String>,
    pub date_time: Option<String>,
}

/// Extract detailed file metadata and EXIF tags from the image file.
#[tauri::command]
pub fn get_image_info(
    state: State<'_, SharedAppState>,
    path: String,
) -> Result<ImageMetadataInfo, String> {
    let guard = state.read();
    let img = guard
        .source_image
        .as_ref()
        .ok_or_else(|| "No source image loaded in state".to_string())?;

    let width = img.width();
    let height = img.height();
    let mp = format!("{:.2} MP", (width as f64 * height as f64) / 1_000_000.0);

    // Calculate aspect ratio
    fn gcd(mut a: u32, mut b: u32) -> u32 {
        while b != 0 {
            let t = b;
            b = a % b;
            a = t;
        }
        a
    }
    let g = gcd(width, height);
    let aspect_ratio = if g > 0 {
        format!("{}:{}", width / g, height / g)
    } else {
        "1:1".to_string()
    };

    let p = std::path::Path::new(&path);
    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image.png")
        .to_string();

    let file_size_formatted = match std::fs::metadata(&path) {
        Ok(meta) => {
            let len = meta.len();
            if len >= 1_048_576 {
                format!("{:.2} MB", len as f64 / 1_048_576.0)
            } else {
                format!("{:.1} KB", len as f64 / 1024.0)
            }
        }
        Err(_) => "Unknown".to_string(),
    };

    let mut camera_model = None;
    let mut lens_model = None;
    let mut iso = None;
    let mut shutter_speed = None;
    let mut aperture = None;
    let mut date_time = None;

    if let Ok(file) = std::fs::File::open(&path) {
        let mut bufreader = std::io::BufReader::new(&file);
        let exifreader = exif::Reader::new();
        if let Ok(exif) = exifreader.read_from_container(&mut bufreader) {
            for f in exif.fields() {
                match f.tag {
                    exif::Tag::Model => camera_model = Some(f.display_value().with_unit(&exif).to_string()),
                    exif::Tag::LensModel => lens_model = Some(f.display_value().with_unit(&exif).to_string()),
                    exif::Tag::PhotographicSensitivity => iso = Some(f.display_value().with_unit(&exif).to_string()),
                    exif::Tag::ExposureTime => shutter_speed = Some(f.display_value().with_unit(&exif).to_string()),
                    exif::Tag::FNumber => aperture = Some(f.display_value().with_unit(&exif).to_string()),
                    exif::Tag::DateTimeOriginal | exif::Tag::DateTime => {
                        if date_time.is_none() {
                            date_time = Some(f.display_value().with_unit(&exif).to_string());
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(ImageMetadataInfo {
        file_path: path,
        file_name,
        file_size_formatted,
        width,
        height,
        megapixels: mp,
        aspect_ratio,
        camera_model,
        lens_model,
        iso,
        shutter_speed,
        aperture,
        date_time,
    })
}
