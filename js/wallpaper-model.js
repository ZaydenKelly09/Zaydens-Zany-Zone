/* Pure composition math. All layout and transform distances are INCHES.
 * No DOM, preview size, devicePixelRatio, or output pixel count lives in the scene.
 * This file also works in Node so the physical relationships can be tested directly. */
(function (root) {
    'use strict';
    const defaults = () => [
        { id: 1, widthPx: 2560, heightPx: 1440, diagonalIn: 27, xIn: 0, yIn: 0, color: '#a78bfa' },
        { id: 2, widthPx: 1080, heightPx: 1920, diagonalIn: 24, xIn: 0, yIn: 0, color: '#34d399' }
    ];
    function validateMonitor(m) {
        if (![m.widthPx, m.heightPx].every(n => Number.isInteger(n) && n > 0 && n <= 32768))
            throw new Error('Resolution must use whole pixels from 1 to 32,768.');
        if (!Number.isFinite(m.diagonalIn) || m.diagonalIn <= 0 || m.diagonalIn > 200)
            throw new Error('Diagonal size must be greater than 0 and at most 200 inches.');
        if (![m.xIn, m.yIn].every(n => Number.isFinite(n) && Math.abs(n) <= 10000))
            throw new Error('Monitor positions must be finite distances within ±10,000 inches.');
        return m;
    }
    function monitorPhysicalRect(m) {
        validateMonitor(m);
        // Pythagoras: width / diagonal = pixel width / pixel diagonal.
        // Rotated native dimensions naturally rotate the physical rectangle too.
        const pixelDiagonal = Math.hypot(m.widthPx, m.heightPx);
        return { x: m.xIn, y: m.yIn, width: m.diagonalIn * m.widthPx / pixelDiagonal,
            height: m.diagonalIn * m.heightPx / pixelDiagonal };
    }
    function layoutBounds(monitors) {
        const rects = monitors.map(monitorPhysicalRect);
        const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
        return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x,
            height: Math.max(...rects.map(r => r.y + r.height)) - y };
    }
    function sourceToPhysical(point, transform) {
        return { x: transform.xIn + point.x * transform.inchesPerSourcePixel,
            y: transform.yIn + point.y * transform.inchesPerSourcePixel };
    }
    function physicalToSource(point, transform) {
        return { x: (point.x - transform.xIn) / transform.inchesPerSourcePixel,
            y: (point.y - transform.yIn) / transform.inchesPerSourcePixel };
    }
    function physicalToPreview(point, view) {
        return { x: point.x * view.cssPixelsPerInch + view.offsetXCss,
            y: point.y * view.cssPixelsPerInch + view.offsetYCss };
    }
    function previewToPhysical(point, view) {
        return { x: (point.x - view.offsetXCss) / view.cssPixelsPerInch,
            y: (point.y - view.offsetYCss) / view.cssPixelsPerInch };
    }
    function cssToBacking(point, backing) {
        return { x: point.x * backing.xRatio, y: point.y * backing.yRatio };
    }
    function outputToPhysical(point, monitor) {
        const rect = monitorPhysicalRect(monitor);
        return { x: rect.x + point.x * rect.width / monitor.widthPx,
            y: rect.y + point.y * rect.height / monitor.heightPx };
    }
    function physicalToOutput(point, monitor) {
        const rect = monitorPhysicalRect(monitor);
        return { x: (point.x - rect.x) * monitor.widthPx / rect.width,
            y: (point.y - rect.y) * monitor.heightPx / rect.height };
    }
    function monitorSourceRect(monitor, transform) {
        const rect = monitorPhysicalRect(monitor);
        const start = physicalToSource({ x: rect.x, y: rect.y }, transform);
        return { ...start, width: rect.width / transform.inchesPerSourcePixel,
            height: rect.height / transform.inchesPerSourcePixel };
    }
    function imageScaleForLayout(image, monitors, mode = 'fill') {
        const bounds = layoutBounds(monitors);
        const ratios = [bounds.width / image.width, bounds.height / image.height];
        return mode === 'fit' ? Math.min(...ratios) : Math.max(...ratios);
    }
    function centerImage(image, monitors, transform) {
        const b = layoutBounds(monitors), scale = transform.inchesPerSourcePixel;
        return { ...transform, xIn: b.x + (b.width - image.width * scale) / 2,
            yIn: b.y + (b.height - image.height * scale) / 2 };
    }
    function fitImage(image, monitors, mode = 'fill') {
        return centerImage(image, monitors, { inchesPerSourcePixel: imageScaleForLayout(image, monitors, mode) });
    }
    function zoomAtPhysicalPoint(transform, scale, anchor) {
        const sourceAnchor = physicalToSource(anchor, transform);
        return { inchesPerSourcePixel: scale, xIn: anchor.x - sourceAnchor.x * scale,
            yIn: anchor.y - sourceAnchor.y * scale };
    }
    function makePreviewView(monitors, widthCss, heightCss) {
        const b = layoutBounds(monitors);
        const padding = Math.min(54, widthCss * 0.09, heightCss * 0.15);
        const scale = Math.min((widthCss - padding * 2) / b.width, (heightCss - padding * 2) / b.height);
        return { cssPixelsPerInch: scale, offsetXCss: (widthCss - b.width * scale) / 2 - b.x * scale,
            offsetYCss: (heightCss - b.height * scale) / 2 - b.y * scale };
    }
    function arrangePair(monitors, side = 'right', alignment = 'center') {
        const [a, b] = monitors, r1 = monitorPhysicalRect(a), r2 = monitorPhysicalRect(b);
        b.xIn = side === 'left' ? a.xIn - r2.width : a.xIn + r1.width;
        b.yIn = a.yIn + (alignment === 'top' ? 0 : alignment === 'bottom' ? r1.height - r2.height : (r1.height - r2.height) / 2);
    }
    function hasOverlap(monitors) {
        return monitors.some((a, i) => monitors.slice(i + 1).some(b => {
            const ra = monitorPhysicalRect(a), rb = monitorPhysicalRect(b);
            return Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x) > 1e-7 &&
                Math.min(ra.y + ra.height, rb.y + rb.height) - Math.max(ra.y, rb.y) > 1e-7;
        }));
    }
    function outputMapping(monitor) {
        const r = monitorPhysicalRect(monitor);
        return { scaleX: monitor.widthPx / r.width, scaleY: monitor.heightPx / r.height,
            offsetX: -r.x * monitor.widthPx / r.width, offsetY: -r.y * monitor.heightPx / r.height };
    }
    function previewMapping(view) {
        return { scaleX: view.cssPixelsPerInch, scaleY: view.cssPixelsPerInch,
            offsetX: view.offsetXCss, offsetY: view.offsetYCss };
    }
    function sourceToTargetMatrix(transform, mapping) {
        return { a: transform.inchesPerSourcePixel * mapping.scaleX,
            d: transform.inchesPerSourcePixel * mapping.scaleY,
            e: transform.xIn * mapping.scaleX + mapping.offsetX,
            f: transform.yIn * mapping.scaleY + mapping.offsetY };
    }
    // ONE renderer for preview and native exports. Only physical-to-target mapping changes.
    // No rounded source crops: output pixels sample the original full-resolution image.
    function renderMasterImage(ctx, image, transform, mapping) {
        const matrix = sourceToTargetMatrix(transform, mapping);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.transform(matrix.a, 0, 0, matrix.d, matrix.e, matrix.f);
        ctx.drawImage(image, 0, 0);
        ctx.restore();
    }
    const api = { defaults, validateMonitor, monitorPhysicalRect, layoutBounds, sourceToPhysical,
        physicalToSource, physicalToPreview, previewToPhysical, cssToBacking, outputToPhysical,
        physicalToOutput, monitorSourceRect, imageScaleForLayout, centerImage, fitImage,
        zoomAtPhysicalPoint, makePreviewView, arrangePair, hasOverlap, outputMapping,
        previewMapping, sourceToTargetMatrix, renderMasterImage };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WallpaperMath = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this);
