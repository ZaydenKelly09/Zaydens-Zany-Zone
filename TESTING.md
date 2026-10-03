# Functional verification

Tests run in an actual headless Chrome browser against a temporary localhost static server. They upload generated PNGs through the real file input, operate the controls and pointer interactions, download the actual PNGs/ZIP, decode the results, and check pixels against an independent coordinate oracle. The website itself needs none of the testing dependencies.

Development-only invocation, with Node, Playwright, Sharp, and an installed Chrome available:

```
node tests/run-tests.cjs /path/to/node_modules
```

The optional argument selects a directory containing `playwright` and `sharp`; without it normal Node package resolution applies. The test uses the installed Windows Chrome executable. Results and screenshots are saved under `tests/artifacts/`.

## Requested cases

| Requirement | Verification |
| --- | --- |
| Two identical 1920 × 1080 displays | Two actual native PNG downloads and independent pixel sampling |
| 2560 × 1440 + 1920 × 1080 | Mixed-resolution case, 27″ + 24″ |
| Landscape 2560 × 1440 + portrait 1080 × 1920 | Centered, left/high, and right/low cases |
| Same resolution, different physical sizes | 1920 × 1080 at 27″ + 21.5″ |
| Different resolutions and physical sizes | 1440p/1080p and 4K/1080p cases |
| Monitor 2 on the left | Landscape and portrait cases |
| Monitor 2 on the right | Identical and mixed-resolution cases |
| Monitor 2 higher | Portrait top at −4″ with 0.5″ horizontal gap |
| Monitor 2 lower | Portrait top at +4″ with 0.5″ horizontal gap |
| Vertically centered | Physical centers calculated from actual heights |
| 3840 × 2160 source | Coordinate-encoded grid, circle, and diagonal source |
| Much larger source | 8192 × 4096; both PNGs checked against source pixels |
| Smaller source | 640 × 360; both upscaled native PNGs checked |
| Resize after positioning | Byte-identical PNG before/after viewport change |
| Repeated zoom/pan | Real pointer drag and 24 wheel operations |
| Individual exports | Both monitors downloaded in every configuration |
| ZIP export | Actual ZIP downloaded, unpacked with JSZip, both PNG dimensions decoded |
| Exact output dimensions | PNG decoding checks each native width and height, including 3840 × 2160 |

Additional checks cover a real monitor drag moving 1.5 physical inches, keyboard nudging, swapping, orientation, invalid numeric inputs, corrupted images, oversized exports, fit/fill/center/reset/remove, fractional DPR 1.25, and a DPR change to 2. Changing DPR also preserves a byte-identical native export. Mobile (390 px) and desktop layouts are checked for overflow and captured for visual review. Browser JavaScript errors fail the test.

The server mounts the site at `/zany-zone/` to simulate a GitHub Pages repository subdirectory. Browser checks open the homepage directory, navigate to each tool page and back through desktop and mobile navigation, verify the desktop hover/keyboard-focus descriptions, and check that mobile descriptions are available without hover. The wallpaper export and RSC regression checks run on their dedicated pages.

## Cross-monitor evidence

The most demanding visual test uses a 27-inch 2560 × 1440 landscape display and a 24-inch 1080 × 1920 portrait display to its left, 4 inches higher, with a 0.5-inch gap. The test positions a circle across the physical boundary, alongside horizontal/vertical grid lines and a diagonal.

- `tests/artifacts/cross-monitor-alignment.png`: independently rendered physical reference above; separately exported PNGs resized according to physical dimensions and reconstructed below. The circle, diagonal, and horizontal lines visibly continue across the display gap at the expected physical positions.
- `tests/artifacts/wallpaper-monitor1-2560x1440.png` and `wallpaper-monitor2-1080x1920.png`: the actual exports used in that reconstruction.
- `tests/artifacts/alignment-source-3840x2160.png`: diagnostic source image.
- `tests/artifacts/report.json`: machine-readable results, geometries, transforms, pixel sample counts, and maximum channel error.

The independent pixel oracle maps output pixel centers through each display's physical dimensions to source pixels without calling the application's conversion functions or renderer. It samples the coordinate-encoded background away from narrow strokes; RGB channel error must be at most 3 out of 255. Black areas are checked exactly. A separate feature check detects a white horizontal grid line in each native PNG and checks that its physical height agrees within two native pixel pitches per monitor. The visual reconstruction adds the circle and diagonal check. Native pixel sampling and image-resize antialiasing introduce unavoidable subpixel raster differences, while the underlying physical transform remains exact.

## RSC regression

Default inputs still produce a 46.00″ × 15.00″ blank. Fractional inputs 15.5″ × 8.25″ × 6.75″ produce 49.50″ × 15.00″; horizontal marks are 2.00″, 17.50″, 25.75″, 41.25″, 49.50″ and vertical marks are 4.13″, 10.88″, 15.00″. Segment sizes are checked separately. SVG updates and preserves GLUE, panel/flap labels, cut indicators, and dashed score lines. Computed styles require MARK AT to be bold and at least 1.75 times the Size font, with a different accent color, in both tables.

The pure RSC model tests cover interior/exterior conversions across four board thicknesses, decimal measurements, round trips in both directions, impossible exterior clearances, zero/negative values, and the original blank/score formulas including the 2-inch glue tab. Browser tests exercise mode switching repeatedly without input drift, live thickness changes and presets, exterior-to-inside blank calculations, inline errors, diagram proportion changes, and mobile horizontal diagram exploration.

## Flip profit regression

Pure model checks cover all investment and selling-cost categories, net proceeds/profit, ROI, margin, break-even and target price algebra, empty optional inputs, decimal costs and invalid fees. Browser checks exercise the homepage card, desktop tooltip, live results, offer check, saved fee presets and impossible fee validation. Mobile navigation visits the Flip Profit page under `/zany-zone/` and checks horizontal overflow. The original wallpaper export and RSC calculator tests still run in the same suite.

The report verifies the browser/export relationship mathematically and visually. It does not claim a physical hardware test applying the files in Windows. Real-screen continuity depends on entering the actual visible display dimensions/positions and applying each export without additional operating-system scaling.
