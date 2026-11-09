use std::sync::Arc;
use log::info;
use parking_lot::RwLock;
use rayon::{ThreadPool, ThreadPoolBuilder};

use crate::rendering::pipeline::{render_preview, RenderError};
use crate::state::app_state::AppState;

/// Dedicated Rayon thread pool for offloading image processing, downscaling,
/// and print sheet rendering from the Tauri main/UI threads.
pub struct WorkerPool {
    pool: ThreadPool,
}

impl std::fmt::Debug for WorkerPool {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("WorkerPool")
            .field("current_num_threads", &self.pool.current_num_threads())
            .finish()
    }
}

impl Default for WorkerPool {
    fn default() -> Self {
        Self::new(None)
    }
}

impl WorkerPool {
    /// Initialize a new Rayon worker pool.
    ///
    /// If `num_threads` is `None`, defaults to `available_parallelism - 1` (minimum 1)
    /// to guarantee UI thread responsiveness during heavy computation.
    pub fn new(num_threads: Option<usize>) -> Self {
        let threads = num_threads.unwrap_or_else(|| {
            std::thread::available_parallelism()
                .map(|n| n.get().saturating_sub(1).max(1))
                .unwrap_or(4)
        });

        info!("Initializing worker Rayon pool with {threads} dedicated threads");

        let pool = ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|idx| format!("photoid-worker-{idx}"))
            .build()
            .expect("Failed to create Rayon thread pool");

        Self { pool }
    }

    /// Run a closure synchronously on the Rayon pool, blocking the calling thread
    /// until complete and returning its result.
    pub fn spawn_blocking<F, R>(&self, f: F) -> R
    where
        F: FnOnce() -> R + Send + 'static,
        R: Send + 'static,
    {
        self.pool.install(f)
    }

    /// Asynchronously spawn a fire-and-forget task onto the Rayon pool.
    pub fn spawn<F>(&self, f: F)
    where
        F: FnOnce() + Send + 'static,
    {
        self.pool.spawn(f);
    }

    /// Convenience method to render an updated preview on the worker pool.
    pub fn spawn_preview_render(
        &self,
        state: Arc<RwLock<AppState>>,
    ) -> Result<Vec<u8>, RenderError> {
        self.spawn_blocking(move || {
            let state_guard = state.read();
            render_preview(&state_guard, 1280)
        })
    }
}

/// Freestanding convenience helper for preview rendering on the global Rayon pool.
pub fn spawn_preview_render(state: Arc<RwLock<AppState>>) -> Result<Vec<u8>, RenderError> {
    rayon::scope(|_| {
        let state_guard = state.read();
        render_preview(&state_guard, 1280)
    })
}
