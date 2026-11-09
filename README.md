# GSpaceOne PhotoID

<p align="center">
  <strong>🖼️ High-Performance ID Photo Printing Application</strong><br>
  <em>Cross-platform desktop app for Windows &amp; macOS with GPU-accelerated image processing</em>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue">
  <img alt="Built with" src="https://img.shields.io/badge/built%20with-Tauri%20v2%20%2B%20React%20%2B%20Rust-orange">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
  <img alt="Version" src="https://img.shields.io/badge/version-0.1.0-brightgreen">
</p>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [How to Use the App](#-how-to-use-the-app)
- [Application Architecture](#-application-architecture)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Development Setup](#-development-setup)
- [Building for Production](#-building-for-production)
- [Deployment Guide](#-deployment-guide)
- [Supported Sizes](#-supported-sizes)
- [Technology Stack](#-technology-stack)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 Overview

**GSpaceOne PhotoID** is a professional-grade desktop application designed for high-speed ID photo printing. It leverages **GPU compute shaders** (via WebGPU/wgpu) and **multi-threaded CPU processing** (via Rayon) to deliver real-time, non-destructive image adjustments with zero UI blocking.

Built with **Tauri v2** (Rust backend) and **React 18** (TypeScript frontend), it produces native desktop binaries under 10 MB with near-native performance on both Windows and macOS.

---

## ✨ Key Features

### 🖥️ Rendering Engine (GPU/CPU Hybrid)
- **Non-destructive pipeline**: Original image is never mutated — all adjustments (brightness, exposure, gamma) are stored as parameters and applied at render time
- **GPU Acceleration**: WGSL compute shaders running on Vulkan (Windows), Metal (macOS), or DX12 via `wgpu`
- **CPU Fallback**: Automatic fallback to Rayon multi-threaded parallel processing when GPU is unavailable
- **Real-time Preview**: 50ms debounced adjustments with Web Worker-based image decoding

### 🪟 Workspace & Floating UI
- **Central Preview Canvas**: Interactive canvas with smooth zoom (mouse wheel) and pan (drag)
- **Detachable Settings Window**: Float the settings panel as a separate always-on-top window, or dock it as a side panel
- **Interactive Crop Tool**: 8-handle crop overlay with aspect ratio presets (Free, 1:1, 3:4, 2:3)
- **Thread-safe UI**: Heavy image processing runs on background threads — the UI never freezes

### 🖨️ Smart Print Layout
- **Auto-tiling Algorithm**: Maximizes the number of ID photos per sheet by evaluating both portrait and landscape orientations
- **Standard ID Sizes**: 1", 1.5", 2", 2.5" formats
- **Paper Sizes**: 4×6, 5×7, A4, Letter
- **High-quality Output**: Lanczos3 resampling from full-resolution source with hairline cutting guides
- **Native OS Print API**: Direct integration with Windows `PrintDlg` and macOS `NSPrintOperation`

---

## 📖 How to Use the App

### Step 1: Open an Image
- Click the **"Open Image"** button in the toolbar, or drag & drop an image file onto the canvas
- Supported formats: JPEG, PNG, BMP, TIFF, WebP

### Step 2: Adjust Image Settings
- Click **"Settings"** to open the adjustment panel (docked or floating)
- Use the sliders to adjust:
  | Slider | Range | Description |
  |--------|-------|-------------|
  | **Brightness** | -100 to +100 | Additive brightness adjustment |
  | **Exposure** | -3.0 to +3.0 | Multiplicative exposure (2^value) |
  | **Gamma** | 0.1 to 5.0 | Power-curve gamma correction |
- **Double-click** any slider value to reset it to default
- All adjustments are non-destructive and update in real-time

### Step 3: Crop the Photo
- Select an aspect ratio preset or enter custom dimensions
- Drag the crop handles on the canvas to define the ID photo region
- Click **"Apply Crop"** to confirm

### Step 4: Configure Print Layout
- Select your **ID Photo Size** (1", 1.5", 2", 2.5")
- Select your **Paper Size** (4×6, 5×7, A4, Letter)
- The app automatically calculates the maximum number of photos that fit
- Preview the layout in the **Print Preview** panel

### Step 5: Print
- Click **"Print"** to send the optimized layout to your printer
- The app uses native OS print dialogs for maximum compatibility
- High-resolution output at 300 DPI with cutting guides

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open image |
| `Ctrl+P` | Print |
| `Ctrl+Z` | Reset adjustments |
| `Mouse Wheel` | Zoom in/out on canvas |
| `Mouse Drag` | Pan the canvas |

---

## 🏗️ Application Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (React 18 + TypeScript)            │
│                                                                 │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ PreviewCanvas│  │FloatingSettings │  │  PrintPreview    │   │
│  │ (WebGL/2D)   │  │(Docked/Floating)│  │  (Layout Grid)   │   │
│  └──────┬───────┘  └────────┬────────┘  └────────┬─────────┘   │
│         │                   │                     │             │
│  ┌──────┴───────────────────┴─────────────────────┴──────────┐  │
│  │              Zustand State Store (Reactive)               │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │ invoke (IPC, debounced 50ms)      │
│  ┌──────────────────────────┴────────────────────────────────┐  │
│  │              Web Worker (Image Decode)                     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ Tauri IPC (JSON serialization)
┌─────────────────────────────────┴───────────────────────────────┐
│                     Backend (Rust + Tauri v2)                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Command Router (Tauri Commands)              │   │
│  └──────┬───────────────┬────────────────────┬──────────────┘   │
│         │               │                    │                  │
│  ┌──────┴──────┐ ┌──────┴──────┐  ┌─────────┴──────────┐      │
│  │  Rendering  │ │   Print     │  │   App State         │      │
│  │  Pipeline   │ │   Spooler   │  │   Arc<RwLock<T>>    │      │
│  └──┬──────┬───┘ └─────────────┘  └────────────────────-┘      │
│     │      │                                                    │
│  ┌──┴──┐ ┌─┴────────┐                                          │
│  │ GPU │ │ CPU Pool  │                                          │
│  │wgpu │ │ (Rayon)   │                                          │
│  └─────┘ └──────────┘                                          │
└─────────────────────────────────────────────────────────────────┘
```

### Non-Destructive Rendering Pipeline

```
Source Image (Immutable) → Crop Matrix → Scale Matrix → Brightness → Exposure → Gamma → Output Buffer
```

All operations are stored as transform parameters. The original image pixels are never modified.

### Thread Isolation Model

| Thread | Responsibility | Blocks UI? |
|--------|---------------|------------|
| **JS Main Thread** | DOM rendering, slider events, canvas compositing | — |
| **Web Worker** | Base64 → ImageBitmap decode | No |
| **Tauri IPC Thread** | Command dispatch, JSON serialization | No |
| **Rayon Thread Pool** | CPU pixel operations (n-1 cores) | No |
| **wgpu Compute** | GPU shader dispatch (256 workgroups) | No |
| **Print Spooler** | Layout computation + OS print API | No |

---

## 📁 Project Structure

```
GSpaceOne PhotoID/
│
├── 📄 package.json              # Node.js dependencies & scripts
├── 📄 tsconfig.json             # TypeScript configuration
├── 📄 tsconfig.node.json        # TypeScript config for Vite
├── 📄 vite.config.ts            # Vite build configuration
├── 📄 index.html                # HTML entry point
├── 📄 .gitignore                # Git ignore rules
├── 📄 README.md                 # This file
│
├── 📂 src/                      # ─── React Frontend ───
│   ├── 📄 main.tsx              # React entry point
│   ├── 📄 App.tsx               # Main application layout & toolbar
│   │
│   ├── 📂 components/
│   │   ├── 📂 canvas/
│   │   │   └── 📄 PreviewCanvas.tsx    # Interactive canvas (zoom/pan/crop overlay)
│   │   ├── 📂 settings/
│   │   │   ├── 📄 FloatingSettings.tsx # Detachable settings panel
│   │   │   ├── 📄 AdjustmentSlider.tsx # Reusable slider component
│   │   │   └── 📄 CropTool.tsx         # Crop controls & aspect ratio presets
│   │   └── 📂 print/
│   │       └── 📄 PrintPreview.tsx     # Print layout visualization
│   │
│   ├── 📂 state/
│   │   └── 📄 store.ts          # Zustand state management
│   │
│   ├── 📂 hooks/
│   │   ├── 📄 useImageProcessor.ts   # Debounced Tauri invoke wrapper
│   │   └── 📄 useFloatingWindow.ts   # Multi-window management
│   │
│   ├── 📂 workers/
│   │   └── 📄 imageDecoder.worker.ts # Off-thread image decode
│   │
│   └── 📂 styles/
│       └── 📄 globals.css       # Dark theme stylesheet (16 KB)
│
└── 📂 src-tauri/                # ─── Rust Backend ───
    ├── 📄 Cargo.toml            # Rust dependencies
    ├── 📄 build.rs              # Tauri build script
    ├── 📄 tauri.conf.json       # Tauri window & app configuration
    │
    ├── 📂 capabilities/
    │   └── 📄 default.json      # Tauri v2 permission capabilities
    │
    ├── 📂 shaders/
    │   └── 📄 adjustments.wgsl  # GPU compute shader (WGSL)
    │
    ├── 📂 icons/                # App icons (all sizes)
    │
    └── 📂 src/
        ├── 📄 main.rs           # Tauri entry point
        ├── 📄 lib.rs            # Module registration & app builder
        ├── 📄 commands.rs       # IPC command handlers (10 commands)
        │
        ├── 📂 rendering/       # ─── Rendering Engine Module ───
        │   ├── 📄 mod.rs
        │   ├── 📄 pipeline.rs       # Non-destructive render pipeline
        │   ├── 📄 adjustments.rs    # CPU parallel pixel operations (Rayon)
        │   └── 📄 gpu_compute.rs    # GPU compute engine (wgpu)
        │
        ├── 📂 print_layout/    # ─── Smart Print Layout Module ───
        │   ├── 📄 mod.rs
        │   ├── 📄 paper.rs         # Paper & ID size definitions
        │   └── 📄 spooler.rs       # Auto-tiling layout engine
        │
        ├── 📂 state/           # ─── State Management ───
        │   ├── 📄 mod.rs
        │   └── 📄 app_state.rs     # Thread-safe shared state
        │
        └── 📂 workers/         # ─── Worker Pool ───
            ├── 📄 mod.rs
            └── 📄 pool.rs          # Rayon thread pool management
```

---

## 📋 Prerequisites

### All Platforms
| Requirement | Version | Installation |
|------------|---------|-------------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org/) |
| **Rust** | 1.77+ | [rustup.rs](https://rustup.rs/) |
| **Git** | 2.0+ | [git-scm.com](https://git-scm.com/) |

### Windows
| Requirement | Details |
|------------|---------|
| **Visual Studio Build Tools** | Install "Desktop development with C++" workload |
| **WebView2** | Pre-installed on Windows 10/11 (1803+) |

```powershell
# Install Rust on Windows
winget install Rustlang.Rustup
# OR download from https://rustup.rs/

# Verify
rustc --version
cargo --version
```

### macOS
| Requirement | Details |
|------------|---------|
| **Xcode Command Line Tools** | `xcode-select --install` |
| **Homebrew** (optional) | For additional tools |

```bash
# Install Rust on macOS
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Xcode CLI tools
xcode-select --install

# Verify
rustc --version
cargo --version
```

---

## 🛠️ Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Tanasiri-Dev/GSpaceOne_PhotoID.git
cd GSpaceOne_PhotoID
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install
```

### 3. Run in Development Mode

```bash
# Start Tauri development server (hot-reload enabled)
npm run tauri dev
```

This will:
- Start the Vite dev server on `http://localhost:1420`
- Compile the Rust backend
- Open the application window with hot-reload

### 4. Type Check

```bash
# TypeScript type checking
npx tsc --noEmit

# Rust linting
cd src-tauri && cargo clippy
```

---

## 🚀 Building for Production

### Build for Current Platform

```bash
npm run tauri build
```

### Build for Windows

```powershell
# Produces: src-tauri/target/release/bundle/
#   ├── msi/GSpaceOne PhotoID_0.1.0_x64_en-US.msi
#   └── nsis/GSpaceOne PhotoID_0.1.0_x64-setup.exe

npm run tauri build
```

**Output locations:**
| Format | Path | Description |
|--------|------|-------------|
| **NSIS Installer** | `src-tauri/target/release/bundle/nsis/` | Modern Windows installer (.exe) |
| **MSI Installer** | `src-tauri/target/release/bundle/msi/` | Enterprise-friendly MSI package |
| **Standalone** | `src-tauri/target/release/` | Portable executable |

### Build for macOS

```bash
# On a macOS machine:
npm run tauri build

# Output: src-tauri/target/release/bundle/
#   ├── dmg/GSpaceOne PhotoID_0.1.0_aarch64.dmg
#   └── macos/GSpaceOne PhotoID.app
```

**Output locations:**
| Format | Path | Description |
|--------|------|-------------|
| **DMG** | `src-tauri/target/release/bundle/dmg/` | macOS disk image |
| **App Bundle** | `src-tauri/target/release/bundle/macos/` | .app bundle |

### Cross-compilation Notes

> ⚠️ **Tauri does not support cross-compilation.** You must build on the target platform:
> - Windows builds require a Windows machine
> - macOS builds require a macOS machine
>
> For CI/CD, use **GitHub Actions** with matrix builds:

```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]

jobs:
  build:
    strategy:
      matrix:
        os: [windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install
      - run: npm run tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: bundle-${{ matrix.os }}
          path: src-tauri/target/release/bundle/
```

---

## 📦 Deployment Guide

### Windows Deployment

#### Option A: NSIS Installer (Recommended for end users)
1. Build: `npm run tauri build`
2. Distribute: `src-tauri/target/release/bundle/nsis/GSpaceOne PhotoID_0.1.0_x64-setup.exe`
3. Users double-click the installer → installs to Program Files → creates Start Menu shortcut

#### Option B: MSI Installer (Enterprise/IT deployment)
1. Build: `npm run tauri build`
2. Distribute: `src-tauri/target/release/bundle/msi/GSpaceOne PhotoID_0.1.0_x64_en-US.msi`
3. Can be deployed via Group Policy, SCCM, or Intune

#### Option C: Portable
1. Copy `src-tauri/target/release/gspaceone-photoid.exe` to any folder
2. Requires WebView2 runtime (pre-installed on Windows 10/11)

### macOS Deployment

#### Option A: DMG (Recommended)
1. Build: `npm run tauri build`
2. Distribute: `src-tauri/target/release/bundle/dmg/GSpaceOne PhotoID_0.1.0_aarch64.dmg`
3. Users open DMG → drag app to Applications folder

#### Option B: Direct .app Bundle
1. Copy `src-tauri/target/release/bundle/macos/GSpaceOne PhotoID.app` to `/Applications`

#### Code Signing (Production)
For production distribution, sign your builds:

**Windows:**
```powershell
# Set signing certificate environment variables before building
$env:TAURI_SIGNING_PRIVATE_KEY = "your-private-key"
npm run tauri build
```

**macOS:**
```bash
# Requires Apple Developer account
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
npm run tauri build
```

---

## 📐 Supported Sizes

### ID Photo Sizes
| Name | Width × Height | Pixels @300 DPI | Common Use |
|------|---------------|----------------|------------|
| **1"** | 1.0" × 1.0" | 300 × 300 px | Small ID cards |
| **1.5"** | 1.5" × 2.0" | 450 × 600 px | Passport (many countries) |
| **2"** | 2.0" × 2.0" | 600 × 600 px | US visa, Indian passport |
| **2.5"** | 2.0" × 2.5" | 600 × 750 px | Standard ID photo |

### Paper Sizes
| Paper | Width × Height | Region |
|-------|---------------|--------|
| **4×6** | 4.0" × 6.0" | Standard photo paper |
| **5×7** | 5.0" × 7.0" | Medium photo paper |
| **A4** | 8.27" × 11.69" | International standard |
| **Letter** | 8.5" × 11.0" | US standard |

---

## 🔧 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | Reactive UI components |
| **State** | Zustand 5 | Lightweight state management |
| **Build** | Vite 6 | Fast bundling with HMR |
| **Desktop** | Tauri v2 | Native window management, IPC, printing |
| **Backend** | Rust (Tokio + Rayon) | Async runtime + parallel processing |
| **Image** | `image` + `imageproc` | Pure-Rust image codecs and manipulation |
| **GPU** | `wgpu` (WebGPU) | Cross-platform GPU compute shaders |
| **Shader** | WGSL | WebGPU Shading Language |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

### Development Guidelines
- Run `npx tsc --noEmit` before committing (TypeScript)
- Run `cd src-tauri && cargo clippy` before committing (Rust)
- Follow existing code style and naming conventions
- Add comments for complex algorithms
- Keep UI thread free of heavy computation

---

## 📄 License

This project is licensed under the MIT License.

```
MIT License

Copyright (c) 2026 Tanasiri-Dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Tanasiri-Dev">Tanasiri-Dev</a>
</p>
