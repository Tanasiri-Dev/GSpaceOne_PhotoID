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

    let layout = compute_layout(id_spec, paper_spec, 300, 0.25);
    Ok(PrintLayoutInfo::from(&layout))
}

/// 5. Render full high-resolution sheet and trigger native OS print spooler.
#[tauri::command]
pub async fn execute_print(
    state: State<'_, SharedAppState>,
    pool: State<'_, Arc<WorkerPool>>,
    id_size: String,
    paper_size: String,
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
                adjustments: guard.adjustments,
                crop: guard.crop,
                gpu_available: false,
            };
            (img, snapshot)
        };

        let id_spec = find_id_size(&id_size).ok_or_else(|| format!("Unknown ID size: '{id_size}'"))?;
        let paper_spec = find_paper(&paper_size).ok_or_else(|| format!("Unknown paper size: '{paper_size}'"))?;

        info!(
            "Rendering print sheet: ID size {:?}, Paper size {:?}",
            id_spec.name, paper_spec.name
        );

        let layout = compute_layout(id_spec, paper_spec, 300, 0.25);
        let sheet = render_print_sheet(&source_img, &state_snapshot, &layout, 300)
            .map_err(|e| format!("Failed to render print sheet: {e}"))?;

        // Save sheet to temporary directory for OS print spooler
        let temp_filename = format!("gspaceone_photoid_print_{}.png", uuid::Uuid::new_v4());
        let temp_path = std::env::temp_dir().join(&temp_filename);
        sheet
            .save(&temp_path)
            .map_err(|e| format!("Failed to save print spool file to '{}': {e}", temp_path.display()))?;

        info!("Print sheet written to temporary file: {}", temp_path.display());

        // Dispatch to native operating system print API
        dispatch_native_print(&temp_path)?;

        Ok(format!(
            "Print sheet successfully spooled: {} photos on {} ({})",
            layout.total_photos, layout.paper_name, temp_path.display()
        ))
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

/// Dispatches image to native OS printing subsystem.
fn dispatch_native_print(path: &std::path::Path) -> Result<(), String> {
    let path_str = path.to_str().ok_or_else(|| "Invalid print file path".to_string())?;

    #[cfg(target_os = "windows")]
    {
        // On Windows: trigger the standard Windows Print verb via PowerShell
        let script = format!("Start-Process -FilePath '{}' -Verb Print", path_str.replace('\'', "''"));
        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .status()
            .map_err(|e| format!("Failed to spawn PowerShell print command: {e}"))?;

        if !status.success() {
            // Fallback: launch default Windows photo viewer
            let _ = std::process::Command::new("cmd")
                .args(["/C", "start", "", path_str])
                .status();
        }
    }

    #[cfg(target_os = "macos")]
    {
        // On macOS: send to lpr print spooler or launch Preview print dialog
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
        // Linux / Unix fallback
        let _ = std::process::Command::new("lpr")
            .arg(path_str)
            .status();
    }

    Ok(())
}
