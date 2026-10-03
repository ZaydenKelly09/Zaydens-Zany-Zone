# Zayden's Zany Zone

This is an ordinary multi-page static site. Deploy the directory as-is to GitHub Pages, including its `css/` and `js/` folders. All internal links and assets use relative paths, so it also works under a repository subdirectory.

- `index.html` — homepage and tool directory.
- `wallpaper.html` — Multi-Monitor Wallpaper Aligner.
- `rsc-box.html` — RSC Box Calculator.
- `flip-profit.html` — Flip Profit Calculator.
- `css/shared.css` and `js/shared.js` — site identity, navigation, layout, and toast feedback.
- `css/wallpaper.css`, `js/wallpaper-model.js`, and `js/wallpaper.js` — wallpaper UI and its unchanged physical composition model/export behavior.
- `css/rsc.css`, `js/rsc-model.js`, and `js/rsc.js` — RSC geometry, controls, score tables, and diagram.
- `css/flip.css`, `js/flip-model.js`, and `js/flip.js` — resale math, cost breakdown, targets, and local fee/value storage.

To add a tool, create a dedicated HTML page, link it from the homepage cards and the navigation on each page, and give any tool-specific CSS/JS its own files. The small static navigation markup is repeated in each HTML file; shared appearance lives in `css/shared.css`.

No build, package installation, application server, or framework is required. The original Tailwind CDN, JSZip CDN, and Google Fonts dependencies remain. An internet connection is needed to load those external dependencies; image processing happens entirely inside the browser.

## Wallpaper setup

1. Enter each display's native resolution and actual diagonal. The starting 27-inch and 24-inch sizes are guesses; replace them with your screen sizes.
2. Use Arrange monitors, alignment shortcuts, or precise inch positions to match the physical **visible display areas**. Include any gap between those areas, such as bezels. Positive Y points down.
3. Choose one wallpaper. Fill, fit, pan, center, or zoom the shared composition. The optional grid is in physical inches.
4. Download each native-resolution PNG or Export All as ZIP. Preview labels and grid are excluded.
5. Assign each PNG to its corresponding display in Windows using per-monitor backgrounds, native display resolution, and Center positioning.

## Composition model

For native dimensions `W × H` and diagonal `D` inches:

```
physicalWidth  = D × W / hypot(W, H)
physicalHeight = D × H / hypot(W, H)
```

Monitor origins and rectangles live in inches. One master transform stores `xIn`, `yIn`, and `inchesPerSourcePixel`. A source point maps to the layout as:

```
physicalX = xIn + sourceX × inchesPerSourcePixel
physicalY = yIn + sourceY × inchesPerSourcePixel
```

Each monitor independently maps its inch rectangle to its configured native pixels. Thus output pixel **centers** sample:

```
physicalX = monitorLeft + (outputX + 0.5) × physicalWidth / nativeWidth
physicalY = monitorTop  + (outputY + 0.5) × physicalHeight / nativeHeight
sourceX   = (physicalX - xIn) / inchesPerSourcePixel
sourceY   = (physicalY - yIn) / inchesPerSourcePixel
```

`renderMasterImage` composes this transform with either the preview or output mapping. Both paths use the same renderer and original image. There are no independent crop states, rounded source rectangles, output-resolution assumptions, or alignment correction constants. Canvas backing pixels and CSS pixels are handled separately. A browser resize changes the preview camera and backing store, leaving monitor geometry and image transform intact.

Uncovered image areas export as opaque black, matching the preview. Changing monitor geometry preserves the current image transform; choose Fill or Reset image to recompute the composition deliberately. Orientation swaps native width and height. Reset arrangement preserves configured resolutions and physical sizes. Rendering/export already iterate over the monitor array; arrangement shortcuts currently target the two initial displays.

Exports take an immutable geometry/transform snapshot and lock controls until complete. PNGs use high-quality smoothing and Blob downloads. Large backing stores are released between PNGs. Source object URLs are revoked after decoding; download URLs are revoked after the download starts or on page exit. Unsupported allocations/decodes/ZIP failures display toasts. The export guard allows up to 64 megapixels and 16,384 pixels per side; the source guard allows up to 160 megapixels and 250 MB.

## RSC results

Both tables show **MARK AT before Size**, with larger bold purple/emerald numbers. Size remains visible at half the desktop mark font size. The original formulas, cumulative calculations, 2-inch glue tab, cut/score lines, and SVG panel labels remain intact.

The RSC selector accepts either interior or exterior L × W × D and converts the other set from editable board thickness. Side walls add one thickness on each opposing face, so outside length and width are inside dimensions plus `2t`. A closed RSC has two overlapping flap layers at each end; the conservative clear-depth estimate treats outside depth as inside depth plus `4t`. The B/C/E presets are approximate; measuring the board with calipers is preferable. Switching modes retains an unrounded interior representation, so repeated toggles do not compound display rounding.

The existing hand-marking blank formulas take **interior dimensions**: `2L + 2W + 2` overall length and `D + W` overall width. Exterior entries are converted to interior before those formulas run. These are simplified score-to-score marks and do not include manufacturer-specific bending/score allowances. The diagram shows the RSC net, 2-inch glue tab, flap cuts, body folds, and the main dimensions, with visual proportions constrained for extreme box shapes.

The [Fibre Box Association's scored-sheet report](https://www.fibrebox.org/assets/2025/07/B155_TR2-2_Scored_and_Slotted_Sheets_2018_Edition.pdf) explains why real box blanks need board-specific score allowances. [Packaging Corporation of America](https://www.packagingcorp.com/resource-hub/beyond-the-box/basic-box-styles/) describes the overlapping RSC flaps, and this [Fibre Box Association board specification](https://www.fibrebox.org/assets/2025/09/Walmart_Corrugated-Board_Specifications_Automation_Packaging_Standards.pdf) shows why flute thickness presets are only estimates.

## Flip profit calculator

Investment includes purchase price, purchase sales tax, repairs, and other purchase costs. Selling costs include percentage fees on the gross sale price, fixed fees, shipping, insurance, packaging, and other selling costs. Net profit is sale price minus selling costs and investment. ROI divides profit by investment; margin divides profit by gross sale price. A zero denominator displays an em dash. The minimum sale price for a desired profit solves `(investment + fixed selling costs + desired profit) / (1 − combined fee rate)` and rounds up to the next cent. Combined percentage fees of 100% or more are rejected. Fee rates are user-entered; no current marketplace rates are assumed.

See [TESTING.md](TESTING.md) for reproducible tests and visual alignment evidence.
