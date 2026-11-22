<div align="center">

# 🎭 Lighting Plot

**Professional theatrical lighting design software for Windows and macOS**

[![Latest Release](https://img.shields.io/github/v/release/johnapiper/lighting-plot-app?style=flat-square&label=Latest&color=4a90d9)](https://github.com/johnapiper/lighting-plot-app/releases/latest)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey?style=flat-square)](https://github.com/johnapiper/lighting-plot-app/releases/latest)
[![License](https://img.shields.io/badge/license-Proprietary-red?style=flat-square)](LICENSE)

[**⬇ Download for Windows**](https://github.com/johnapiper/lighting-plot-app/releases/latest/download/Lighting-Plot-Setup.exe) &nbsp;·&nbsp;
[**⬇ Download for macOS**](https://github.com/johnapiper/lighting-plot-app/releases/latest/download/Lighting-Plot.dmg) &nbsp;·&nbsp;
[View all releases](https://github.com/johnapiper/lighting-plot-app/releases)

</div>

---

## What is Lighting Plot?

Lighting Plot is a CAD application for drafting theatrical and live-event lighting rigs. Draw plots to scale, manage your fixture library, patch DMX addresses, plan cable runs, and produce publication-ready drawing sheets — all in one desktop app.

---

## Features

### CAD / Model Space
- Drag-and-drop fixture placement from a built-in library or GDTF imports
- Pipes, trusses, lines, rectangles, and text labels
- Fixtures snap and hang onto pipes — move the pipe and the rig follows
- Rotation, scale, and symbol/colour overrides per fixture
- 3D view with beam cones and floor pools from each fixture's beam angle, tilt and rotation
- **Named views**: save, apply and update layer-visibility sets ("FOH only", "Power only"); sheet viewports can use a view independently of the plot
- **Floor coverage heatmap** showing how many beams reach each part of the stage, with per-rectangle coverage percentages
- Large rigs: culled, level-of-detail rendering and memoised fixtures keep plots with thousands of fixtures responsive
- Layer system — colour-coded, lockable, toggleable visibility
- Scale calibration against PDF backgrounds
- Group objects and move them together
- Full undo / redo (50 steps)

### Sheet / Drawing Mode
- Compose viewports into CAD plots at any print scale
- False-scale watermark when display scale doesn't match print scale
- Title block, annotations with arrows, text boxes, fixture legend
- Print via native print preview
- Export the current sheet, or **all sheets into one multi-page vector PDF** (mixed paper sizes)
- **Elevation and section viewports**: show a plot from the front, back or either side with true pipe heights, hanging fixtures, beam cones, height dimensions and a grid line; optionally slice to a depth band to make a section

### Cabling
- Place PDUs, DMX nodes, network switches, and floor boxes
- Draw Power, DMX, and Network cables between fixtures and infrastructure
- 3D cable length calculation accounting for rig height and ceiling grid
- Per-pipe height overrides for accurate per-bar cable estimates
- Power load calculations with overload warnings (Powercon, True1, 13A, 16A, 32A)
- Cable flow animation overlay
- Cable Report with order lengths, configurable stock sizes, and CSV export
- Warns on fixtures with missing power or data connections
- **Rigging & load**: weights per fixture, bar self-weight and rated capacity, hoist (pick-up) points with solved loads (exact for two hoists, continuous-beam for three or more), overload / uplift warnings, hoist markers on the plot, and a CSV rig report. Bar and hoist rating presets, auto-placement of hoists for best balance, and hoists you can drag along the bar or type an exact position for. A planning aid, not an engineering certification.

### DMX & Reports
- Full DMX patch panel with conflict detection
- **Auto-number & Patch** rules: order (reading / by position / left→right), restart per pipe, gaps, a universe per pipe, routing around existing patch — with a live preview and one undo step
- Instrument Schedule, Channel Hookup, Dimmer Schedule
- CSV export for all reports

### File Formats
- Native `.lightplot` project files, with a rolling backup (last 10 saves, beside the project) and a schema version so older builds warn on newer files
- DXF import and export (lines, polylines, arcs, circles, ellipses, splines, text, nested blocks, unit scaling)
- **ETC Eos**: export the patch as a Lightwright-format `.txt` (File ▸ Import ▸ Lightwright on the console), and export a **Magic Sheet background image** (≤ 1920 px) plus a CSV of button positions
- MVR (My Virtual Rig) export and import
- PDF background import, PNG / SVG export

---

## Installation

### Windows

1. Download **[Lighting-Plot-Setup.exe](https://github.com/johnapiper/lighting-plot-app/releases/latest)** from the latest release
2. Run the installer — you can choose the install location
3. A desktop shortcut and Start Menu entry are created automatically
4. Launch **Lighting Plot** from the Start Menu or desktop

> No administrator rights are required if you install to a user folder.

---

### macOS

1. Download **[Lighting-Plot.dmg](https://github.com/johnapiper/lighting-plot-app/releases/latest)** from the latest release
2. Open the `.dmg` and drag **Lighting Plot** into your **Applications** folder
3. On first launch, macOS may show a security warning because the app is not yet notarized:
   - Open **System Settings → Privacy & Security**
   - Scroll down to the blocked app entry and click **Open Anyway**
   - Alternatively: right-click the app icon and choose **Open**, then confirm

The DMG is a **universal binary** — the same file runs natively on both Intel Macs and Apple Silicon (M1/M2/M3).

---

## Updating

The app checks for updates on launch. When a new version is available a banner appears at the top of the window with a direct download link. You can also check manually via the **ℹ About** button in the toolbar → **Check for Updates**.

---

## Building from Source

> Requires [Node.js](https://nodejs.org) 18+ and [Git](https://git-scm.com).

```bash
# Clone
git clone https://github.com/johnapiper/lighting-plot-app.git
cd lighting-plot-app

# Install dependencies
npm install

# Run in development (no rebuild on change)
npm run dev

# Build and run (production bundle)
npm start

# Development bundle with readable stack traces / watch mode
npm run build:dev
npm run watch

# Tests (Vitest) and lint (ESLint) — both run in CI
npm test
npm run lint
```

### Build an installer locally

```bash
# Windows (run on Windows)
npm run dist:win

# macOS (run on macOS)
npm run dist:mac

# Current platform
npm run dist
```

Output goes to the `dist/` folder.

### Cut a release

```bash
npm run release:patch   # 1.1.2 → 1.1.3
npm run release:minor   # 1.1.2 → 1.2.0
npm run release:major   # 1.1.2 → 2.0.0
```

This bumps the version, builds the installer, commits, tags, pushes to GitHub, and creates a GitHub release. GitHub Actions then builds the other platform's installer and attaches it to the same release automatically.

---

## Project Structure

```
lighting-plot-app/
├── main.js                  # Electron main process (IPC handlers, menus, updater)
├── preload.js               # The only bridge between the sandboxed renderer and main
├── lib/                     # Main-process modules (rolling backups, PDF export)
├── src/
│   ├── App.jsx              # Root React component
│   ├── bridge.js            # Renderer-side shim over the preload bridge
│   ├── canvas/              # SVG CAD canvas, snapping, transforms, beam geometry
│   ├── cabling/             # Cable routing + load calculations
│   ├── components/          # UI panels and modals
│   ├── console/             # Eos patch + Magic Sheet export
│   ├── dxf/                 # DXF reader / writer
│   ├── elevation/           # Elevation / section projection
│   ├── fixtures/            # Fixture symbol rendering
│   ├── hooks/               # Extracted App hooks (exports, autosave, theme)
│   ├── mvr/                 # MVR export / import
│   ├── patch/               # DMX helpers + auto-number / auto-patch rules
│   ├── rigging/             # Bar weights, hoist reactions, capacity checks
│   └── store/               # Project model, migration, undo stack
├── tests/                   # Vitest suites (pure logic, IPC allow-list sync)
├── data/
│   └── fixtures.json        # Built-in fixture type library
├── assets/                  # App icons and macOS entitlements
└── .github/workflows/       # CI — builds Windows and macOS installers on release tag
```

---

## License

© 2025 John Piper. All rights reserved.  
Unauthorised copying, distribution, or modification of this software is strictly prohibited.
