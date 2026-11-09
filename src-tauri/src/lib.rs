pub mod commands;
pub mod print_layout;
pub mod rendering;
pub mod state;
pub mod workers;

use std::sync::Arc;
use log::info;
use tauri::Manager;

use crate::rendering::gpu_compute::GpuComputeEngine;
use crate::state::app_state::AppState;
use crate::workers::pool::WorkerPool;

/// Entry point to configure and launch the GSpaceOne PhotoID Tauri v2 application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging system
    let _ = env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .try_init();

    info!("Starting GSpaceOne PhotoID desktop application...");

    // Initialize application state container
    let app_state = AppState::new_shared();

    tauri::Builder::default()
        // Register official Tauri v2 plugins
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        // Register managed application state
        .manage(app_state.clone())
        // Register IPC commands
        .invoke_handler(tauri::generate_handler![
            commands::load_image,
            commands::apply_adjustments,
            commands::set_crop,
            commands::get_print_layout,
            commands::execute_print,
            commands::save_high_quality_image,
            commands::open_settings_window,
            commands::close_settings_window,
            commands::reset_adjustments,
            commands::get_adjustments,
            commands::get_crop,
            commands::get_supported_sizes,
            commands::get_image_info,
            commands::get_printers,
            commands::print_sheet_direct,
        ])
        // Setup lifecycle hook: initializes Rayon worker pool & GPU compute engine
        .setup(move |app| {
            info!("Running application setup hook...");

            // 1. Initialize multi-threaded Rayon worker pool for background rendering
            let worker_pool = Arc::new(WorkerPool::new(None));
            app.manage(worker_pool);

            // 2. Initialize GPU compute acceleration (wgpu/WGSL) with graceful CPU fallback
            let gpu_engine = GpuComputeEngine::new();
            let gpu_available = gpu_engine.is_some();
            app.manage(Arc::new(gpu_engine));

            // 3. Mark GPU acceleration status in central shared state
            app_state.write().gpu_available = gpu_available;

            // 4. Ensure window icon is explicitly set on the main window for Windows title bar & taskbar
            if let Some(main_window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = main_window.set_icon(icon.clone());
                }
            }

            info!(
                "GSpaceOne PhotoID backend fully initialized (GPU compute acceleration: {})",
                if gpu_available { "ENABLED" } else { "DISABLED (Parallel CPU fallback active)" }
            );

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Fatal error while running GSpaceOne PhotoID Tauri application");
}
