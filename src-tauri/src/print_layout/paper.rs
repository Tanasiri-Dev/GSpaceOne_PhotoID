use serde::Serialize;

/// Represents a standard physical paper format.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct PaperSize {
    pub name: &'static str,
    pub width_inches: f64,
    pub height_inches: f64,
}

impl PaperSize {
    /// Calculate pixel dimensions at a specific DPI.
    pub fn pixels(&self, dpi: u32) -> (u32, u32) {
        let w = (self.width_inches * dpi as f64).round() as u32;
        let h = (self.height_inches * dpi as f64).round() as u32;
        (w, h)
    }
}

/// Represents a standard government/commercial ID photo specification.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct IdPhotoSize {
    pub name: &'static str,
    pub width_inches: f64,
    pub height_inches: f64,
}

impl IdPhotoSize {
    /// Calculate pixel dimensions at a specific DPI.
    pub fn pixels(&self, dpi: u32) -> (u32, u32) {
        let w = (self.width_inches * dpi as f64).round() as u32;
        let h = (self.height_inches * dpi as f64).round() as u32;
        (w, h)
    }
}

/// Predefined standard paper sizes supported by desktop and commercial photo printers.
pub const PAPER_SIZES: &[PaperSize] = &[
    PaperSize { name: "4x6", width_inches: 4.0, height_inches: 6.0 },
    PaperSize { name: "5x7", width_inches: 5.0, height_inches: 7.0 },
    PaperSize { name: "A4", width_inches: 8.27, height_inches: 11.69 },
    PaperSize { name: "Letter", width_inches: 8.5, height_inches: 11.0 },
];

/// Predefined standard ID photo formats (standard international / photo lab dimensions).
pub const ID_SIZES: &[IdPhotoSize] = &[
    IdPhotoSize { name: "1inch", width_inches: 0.984, height_inches: 1.378 }, // 25 × 35 mm
    IdPhotoSize { name: "1.5inch", width_inches: 1.378, height_inches: 1.772 }, // 35 × 45 mm Standard
    IdPhotoSize { name: "2inch", width_inches: 2.0, height_inches: 2.0 }, // 50.8 × 50.8 mm US Passport
    IdPhotoSize { name: "2.5inch", width_inches: 2.0, height_inches: 2.5 }, // 50.8 × 63.5 mm (2.5")
];

/// Helper to normalize names for resilient fuzzy lookup.
fn normalize(s: &str) -> String {
    s.trim()
        .to_lowercase()
        .replace('×', "x")
        .replace([' ', '_', '-', '"', '\''], "")
}

/// Lookup a `PaperSize` by name (case-insensitive, ignores spaces and quotes).
pub fn find_paper(name: &str) -> Option<&'static PaperSize> {
    let query = normalize(name);
    PAPER_SIZES.iter().find(|p| {
        let n = normalize(p.name);
        n == query
            || (query == "4r" && n == "4x6")
            || (query == "5r" && n == "5x7")
            || (query == "usletter" && n == "letter")
    })
}

/// Lookup an `IdPhotoSize` by name (case-insensitive, ignores spaces and quotes).
pub fn find_id_size(name: &str) -> Option<&'static IdPhotoSize> {
    let query = normalize(name);
    ID_SIZES.iter().find(|id| {
        let n = normalize(id.name);
        n == query
            || (query == "1" && n == "1inch")
            || (query == "1.5" && n == "1.5inch")
            || (query == "2" && n == "2inch")
            || (query == "2.5" && n == "2.5inch")
            || (query == "passport" && n == "2inch")
            || (query == "visaus" && n == "2inch")
    })
}
