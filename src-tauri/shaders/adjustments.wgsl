struct Params {
    brightness: f32,
    exposure: f32,
    gamma: f32,
    width: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> pixels: array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let total = arrayLength(&pixels);
    if (idx >= total) { return; }

    let packed = pixels[idx];
    var r = f32(packed & 0xFFu) / 255.0;
    var g = f32((packed >> 8u) & 0xFFu) / 255.0;
    var b = f32((packed >> 16u) & 0xFFu) / 255.0;
    let a = f32((packed >> 24u) & 0xFFu) / 255.0;

    // Exposure: multiply by 2^exposure
    let exp_mult = pow(2.0, params.exposure);
    r *= exp_mult; g *= exp_mult; b *= exp_mult;

    // Brightness: additive
    r += params.brightness; g += params.brightness; b += params.brightness;

    // Gamma correction: raise to power 1/gamma
    let inv_gamma = 1.0 / max(params.gamma, 0.01);
    r = pow(clamp(r, 0.0, 1.0), inv_gamma);
    g = pow(clamp(g, 0.0, 1.0), inv_gamma);
    b = pow(clamp(b, 0.0, 1.0), inv_gamma);

    // Clamp and repack
    let ri = u32(clamp(r * 255.0, 0.0, 255.0));
    let gi = u32(clamp(g * 255.0, 0.0, 255.0));
    let bi = u32(clamp(b * 255.0, 0.0, 255.0));
    let ai = u32(clamp(a * 255.0, 0.0, 255.0));
    pixels[idx] = ri | (gi << 8u) | (bi << 16u) | (ai << 24u);
}
