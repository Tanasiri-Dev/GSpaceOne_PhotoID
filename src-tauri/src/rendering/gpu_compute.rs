use log::{error, info, warn};
use wgpu::util::DeviceExt;

/// GPU accelerated compute engine utilizing wgpu and WGSL compute shaders.
pub struct GpuComputeEngine {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl std::fmt::Debug for GpuComputeEngine {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GpuComputeEngine")
            .field("device", &"wgpu::Device")
            .field("queue", &"wgpu::Queue")
            .finish()
    }
}

impl GpuComputeEngine {
    /// Initialize the GPU compute engine.
    ///
    /// Requests a high-performance adapter and compiles the adjustments compute shader.
    /// Returns `None` if GPU hardware or driver support is unavailable, allowing
    /// seamless CPU fallback.
    pub fn new() -> Option<Self> {
        info!("Attempting to initialize GPU compute engine via wgpu...");

        let instance = wgpu::Instance::default();

        let adapter = match pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            force_fallback_adapter: false,
        })) {
            Some(adapter) => {
                let info = adapter.get_info();
                info!(
                    "Found GPU adapter: {} ({:?}, backend: {:?})",
                    info.name, info.device_type, info.backend
                );
                adapter
            }
            None => {
                warn!("No compatible GPU adapter found. Falling back to multi-threaded CPU.");
                return None;
            }
        };

        let (device, queue) = match pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("PhotoID Compute Device"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::default(),
                trace: wgpu::Trace::Off,
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
            },
        )) {
            Ok(device_queue) => device_queue,
            Err(e) => {
                error!("Failed to request GPU logical device: {e}");
                return None;
            }
        };

        let shader_src = include_str!("../../shaders/adjustments.wgsl");
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("PhotoID Adjustments Shader Module"),
            source: wgpu::ShaderSource::Wgsl(shader_src.into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("PhotoID Adjustments Bind Group Layout"),
            entries: &[
                // Binding 0: Uniform parameters (brightness, exposure, gamma, width)
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Binding 1: Read-write Storage buffer for packed RGBA u32 pixels
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("PhotoID Adjustments Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("PhotoID Adjustments Compute Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: Some("main"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            cache: None,
        });

        info!("GPU compute engine successfully initialized!");
        Some(Self {
            device,
            queue,
            pipeline,
            bind_group_layout,
        })
    }

    /// Run the WGSL compute shader on the input RGBA8 pixel buffer.
    ///
    /// Accepts raw RGBA8 slice of size `width * height * 4` and returns the processed
    /// RGBA8 bytes.
    pub fn process_image(
        &self,
        pixels: &[u8],
        width: u32,
        height: u32,
        brightness: f32,
        exposure: f32,
        gamma: f32,
    ) -> Result<Vec<u8>, String> {
        let total_pixels = (width as usize) * (height as usize);
        let expected_len = total_pixels * 4;
        if pixels.len() != expected_len {
            return Err(format!(
                "Pixel buffer length mismatch: expected {expected_len} bytes for {width}x{height}, got {}",
                pixels.len()
            ));
        }

        // Pack uniform buffer (16 bytes: 4x 32-bit values)
        let mut param_bytes = [0u8; 16];
        param_bytes[0..4].copy_from_slice(&brightness.to_ne_bytes());
        param_bytes[4..8].copy_from_slice(&exposure.to_ne_bytes());
        param_bytes[8..12].copy_from_slice(&gamma.to_ne_bytes());
        param_bytes[12..16].copy_from_slice(&width.to_ne_bytes());

        let uniform_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("PhotoID Uniform Params Buffer"),
            contents: &param_bytes,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        // Create storage buffer initialized with current pixel data
        let storage_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("PhotoID Pixels Storage Buffer"),
            contents: pixels,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        });

        // Staging buffer to copy GPU result back to CPU memory
        let buffer_size = expected_len as u64;
        let staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("PhotoID Staging Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("PhotoID Compute Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: storage_buffer.as_entire_binding(),
                },
            ],
        });

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("PhotoID Adjustments Command Encoder"),
        });

        {
            let mut cpass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("PhotoID Adjustments Compute Pass"),
                timestamp_writes: None,
            });
            cpass.set_pipeline(&self.pipeline);
            cpass.set_bind_group(0, &bind_group, &[]);
            let workgroups = ((total_pixels as u32) + 255) / 256;
            cpass.dispatch_workgroups(workgroups, 1, 1);
        }

        encoder.copy_buffer_to_buffer(&storage_buffer, 0, &staging_buffer, 0, buffer_size);
        self.queue.submit(std::iter::once(encoder.finish()));

        // Map staging buffer and retrieve processed pixel data
        let buffer_slice = staging_buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });

        self.device
            .poll(wgpu::PollType::wait_indefinitely())
            .map_err(|e| format!("GPU device poll failed: {e}"))?;

        receiver
            .recv()
            .map_err(|e| format!("Channel receive error: {e}"))?
            .map_err(|e| format!("Staging buffer map error: {e}"))?;

        let mapped_range = buffer_slice.get_mapped_range();
        let result = mapped_range.to_vec();
        drop(mapped_range);
        staging_buffer.unmap();

        Ok(result)
    }
}
