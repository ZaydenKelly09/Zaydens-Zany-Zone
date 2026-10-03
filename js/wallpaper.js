/* Browser controller. Scene is the only composition state; view is disposable UI state. */
(() => {
    'use strict';
    const M = WallpaperMath;
    const $ = id => document.getElementById(id);
    const canvas = $('wallpaper-canvas');
    const ctx = canvas.getContext('2d');
    const scene = { monitors: M.defaults(), image: null,
        transform: { xIn: 0, yIn: 0, inchesPerSourcePixel: 1 } };
    const ui = { mode: 'wallpaper', selectedId: 1, grid: false, busy: false, drag: null,
        view: null, widthCss: 1, heightCss: 1, backing: { xRatio: 1, yRatio: 1 }, frame: 0,
        loadGeneration: 0, downloadUrls: new Set(), loadingUrls: new Set() };
    const monitorInputs = ['widthPx', 'heightPx', 'diagonalIn', 'xIn', 'yIn'];
    M.arrangePair(scene.monitors);

    function buildMonitorControls() {
        $('wallpaper-monitors').innerHTML = scene.monitors.map(m => `
            <div class="wp-monitor" style="--monitor-color:${m.color};margin-bottom:12px">
                <div class="wp-monitor-head"><span class="wp-monitor-dot" aria-hidden="true"></span><h4>Monitor ${m.id}</h4><span class="wp-monitor-resolution" id="m${m.id}-resolution"></span></div>
                <div class="wp-monitor-summary" id="m${m.id}-physical"></div>
                <div class="wp-fields wp-monitor-fields">
                    <label class="wp-field">Resolution width (px)<input id="m${m.id}-widthPx" type="number" min="1" max="32768" step="1" aria-label="Monitor ${m.id} resolution width in pixels"></label>
                    <label class="wp-field">Height (px)<input id="m${m.id}-heightPx" type="number" min="1" max="32768" step="1" aria-label="Monitor ${m.id} resolution height in pixels"></label>
                    <label class="wp-field">Diagonal size (in)<input id="m${m.id}-diagonalIn" type="number" min="0.1" max="200" step="any" inputmode="decimal" aria-label="Monitor ${m.id} diagonal size in inches"></label>
                    <label class="wp-field">Orientation<select id="m${m.id}-orientation" aria-label="Monitor ${m.id} orientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select></label>
                </div>
                <details class="wp-precision"><summary>Fine-tune position <span>inches</span></summary>
                    <div class="wp-fields wp-position-fields">
                        <label class="wp-field">Left (in)<input id="m${m.id}-xIn" type="number" step="any" min="-10000" max="10000" inputmode="decimal" aria-label="Monitor ${m.id} left position in inches" title="Negative values are valid. Position is measured from the left of the overall layout."></label>
                        <label class="wp-field">Top (in)<input id="m${m.id}-yIn" type="number" step="any" min="-10000" max="10000" inputmode="decimal" aria-label="Monitor ${m.id} top position in inches" title="Negative values are valid. Position is measured from the top of the overall layout."></label>
                    </div>
                    <p class="wp-muted">Left and top positions use inches. Negative values place a display left of or above the layout origin.</p>
                </details>
                <button class="wp-btn wp-download-one" id="btn-dl-m${m.id}" data-image-control><span>Download PNG</span><span aria-hidden="true">↓</span></button>
            </div>`).join('');
        scene.monitors.forEach(m => {
            monitorInputs.forEach(key => $(`m${m.id}-${key}`).addEventListener('change', event => {
                const input = event.target;
                const candidate = { ...m, [key]: input.value.trim() === '' ? NaN : Number(input.value) };
                try {
                    M.validateMonitor(candidate);
                    Object.assign(m, candidate);
                    input.removeAttribute('aria-invalid');
                    layoutChanged();
                } catch (error) {
                    input.value = m[key];
                    input.setAttribute('aria-invalid', 'true');
                    showToast(error.message, 'error');
                }
            }));
            $(`m${m.id}-orientation`).addEventListener('change', event => {
                const portrait = event.target.value === 'portrait';
                if (portrait !== (m.heightPx > m.widthPx)) [m.widthPx, m.heightPx] = [m.heightPx, m.widthPx];
                layoutChanged();
            });
            $(`btn-dl-m${m.id}`).addEventListener('click', () => downloadMonitors(m.id));
        });
    }
    function syncMonitorControls() {
        scene.monitors.forEach(m => {
            const rect = M.monitorPhysicalRect(m);
            monitorInputs.forEach(key => {
                const input = $(`m${m.id}-${key}`);
                input.value = key === 'xIn' || key === 'yIn' ? Number(m[key].toFixed(6)) : m[key];
            });
            $(`m${m.id}-orientation`).value = m.heightPx > m.widthPx ? 'portrait' : 'landscape';
            $(`m${m.id}-resolution`).textContent = `${m.widthPx} × ${m.heightPx}`;
            $(`m${m.id}-physical`).textContent = `${m.diagonalIn}″ diagonal · ${rect.width.toFixed(2)}″ × ${rect.height.toFixed(2)}″ · ${(m.widthPx / rect.width).toFixed(1)} px/in`;
        });
        // The legend keeps full native dimensions readable even on a narrow portrait preview.
        $('wallpaper-legend').innerHTML = scene.monitors.map(m => `<span style="--monitor-color:${m.color}"><strong>Monitor ${m.id}</strong> · ${m.widthPx} × ${m.heightPx} px · ${m.diagonalIn}″ ${m.heightPx > m.widthPx ? 'Portrait' : 'Landscape'}</span>`).join('');
    }
    function fillScale() {
        return scene.image ? M.imageScaleForLayout(scene.image, scene.monitors, 'fill') : 1;
    }
    function syncImageControls() {
        const zoom = scene.transform.inchesPerSourcePixel / fillScale() * 100;
        $('wallpaper-zoom').value = Number(zoom.toFixed(3));
        $('wallpaper-zoom-slider').value = Math.min(800, Math.max(1, zoom));
        $('wallpaper-x').value = Number(scene.transform.xIn.toFixed(6));
        $('wallpaper-y').value = Number(scene.transform.yIn.toFixed(6));
        $('wallpaper-density').textContent = scene.image ? Number((1 / scene.transform.inchesPerSourcePixel).toFixed(2)) : '—';
    }
    function syncEnabled() {
        document.querySelectorAll('#tool-wallpaper button, #tool-wallpaper input, #tool-wallpaper select').forEach(el => {
            el.disabled = ui.busy || (el.hasAttribute('data-image-control') && !scene.image);
        });
        canvas.setAttribute('aria-disabled', String(ui.busy));
    }
    function updateStatus() {
        const overlap = M.hasOverlap(scene.monitors);
        let text = overlap ? 'Displays overlap. Arrange them to match your real visible screen edges.' :
            scene.image ? 'One shared scene · Native-resolution exports · Physical alignment preserved' : 'Set up your monitors, then choose a wallpaper.';
        if (scene.image && !overlap) {
            const b = M.layoutBounds(scene.monitors), t = scene.transform;
            if (t.xIn > b.x + 1e-7 || t.yIn > b.y + 1e-7 ||
                t.xIn + scene.image.width * t.inchesPerSourcePixel < b.x + b.width - 1e-7 ||
                t.yIn + scene.image.height * t.inchesPerSourcePixel < b.y + b.height - 1e-7)
                text = 'Some display areas are uncovered; they will export as black. Use Fill layout to cover them.';
        }
        $('wallpaper-status').textContent = text;
        $('wallpaper-status').classList.toggle('warn', overlap || text.startsWith('Some'));
        const description = scene.monitors.map(m => {
            const r = M.monitorPhysicalRect(m);
            return `Monitor ${m.id}, ${m.widthPx} by ${m.heightPx} pixels, ${m.diagonalIn} inch ${m.heightPx > m.widthPx ? 'portrait' : 'landscape'}, left ${r.x.toFixed(2)}, top ${r.y.toFixed(2)} inches`;
        }).join('; ');
        canvas.setAttribute('aria-label', `${description}. ${ui.mode === 'arrange' ? `Selected monitor ${ui.selectedId}. Drag a monitor or use arrow keys to move it.` : 'Drag or use arrow keys to pan wallpaper; scroll to zoom.'} Shift plus arrows moves one inch.`);
    }
    function layoutChanged() {
        syncMonitorControls();
        syncImageControls(); // Recompute displayed zoom only; NEVER refit the underlying image here.
        if (!ui.drag) ui.view = M.makePreviewView(scene.monitors, ui.widthCss, ui.heightCss);
        updateStatus();
        scheduleDraw();
    }
    function imageChanged() {
        syncImageControls();
        updateStatus();
        scheduleDraw();
    }
    function resizePreview() {
        const dpr = window.devicePixelRatio || 1;
        // Canvas's content box excludes its CSS border. Pointer positions use the same box.
        ui.widthCss = Math.max(1, canvas.clientWidth);
        ui.heightCss = Math.max(1, canvas.clientHeight);
        const backingW = Math.max(1, Math.round(ui.widthCss * dpr));
        const backingH = Math.max(1, Math.round(ui.heightCss * dpr));
        if (canvas.width !== backingW) canvas.width = backingW;
        if (canvas.height !== backingH) canvas.height = backingH;
        ui.backing = { xRatio: backingW / ui.widthCss, yRatio: backingH / ui.heightCss };
        ui.view = M.makePreviewView(scene.monitors, ui.widthCss, ui.heightCss);
        ui.drag = null;
        scheduleDraw();
    }
    function scheduleDraw() {
        if (!ui.frame) ui.frame = requestAnimationFrame(() => { ui.frame = 0; drawPreview(); });
    }
    function monitorPath() {
        ctx.beginPath();
        scene.monitors.forEach(m => {
            const r = M.monitorPhysicalRect(m), p = M.physicalToPreview(r, ui.view);
            ctx.rect(p.x, p.y, r.width * ui.view.cssPixelsPerInch, r.height * ui.view.cssPixelsPerInch);
        });
    }
    function drawGrid() {
        const b = M.layoutBounds(scene.monitors), s = ui.view.cssPixelsPerInch;
        // At tiny preview scales omit minor lines; retained lines stay on whole-inch coordinates.
        const step = Math.max(1, Math.ceil(12 / s));
        ctx.beginPath();
        for (let x = Math.ceil(b.x / step) * step; x <= b.x + b.width; x += step) {
            const p = M.physicalToPreview({ x, y: b.y }, ui.view);
            ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + b.height * s);
        }
        for (let y = Math.ceil(b.y / step) * step; y <= b.y + b.height; y += step) {
            const p = M.physicalToPreview({ x: b.x, y }, ui.view);
            ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + b.width * s, p.y);
        }
        ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 1; ctx.stroke();
    }
    function drawPreview() {
        if (!ctx || !ui.view) return;
        // Also check at render time: some display/emulation changes update DPR without
        // dispatching a resize or resolution media-query event until the next interaction.
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.max(1, Math.round(canvas.clientWidth * dpr)) ||
            canvas.height !== Math.max(1, Math.round(canvas.clientHeight * dpr))) {
            resizePreview(); return;
        }
        // CSS coordinates are kept separate from backing pixels, including non-integer DPR.
        ctx.setTransform(ui.backing.xRatio, 0, 0, ui.backing.yRatio, 0, 0);
        ctx.fillStyle = '#090b12'; ctx.fillRect(0, 0, ui.widthCss, ui.heightCss);
        const mapping = M.previewMapping(ui.view);
        if (scene.image) M.renderMasterImage(ctx, scene.image, scene.transform, mapping);
        ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, ui.widthCss, ui.heightCss);
        ctx.save();
        monitorPath(); ctx.clip();
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ui.widthCss, ui.heightCss);
        if (scene.image) M.renderMasterImage(ctx, scene.image, scene.transform, mapping);
        else { ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, ui.widthCss, ui.heightCss); }
        if (ui.grid) drawGrid();
        ctx.restore();
        scene.monitors.forEach(m => {
            const r = M.monitorPhysicalRect(m), p = M.physicalToPreview(r, ui.view);
            const w = r.width * ui.view.cssPixelsPerInch, h = r.height * ui.view.cssPixelsPerInch;
            ctx.strokeStyle = m.color;
            ctx.lineWidth = ui.mode === 'arrange' && ui.selectedId === m.id ? 3 : 1.5;
            ctx.strokeRect(p.x, p.y, w, h);
            ctx.save(); ctx.beginPath(); ctx.rect(p.x, p.y, w, h); ctx.clip();
            ctx.fillStyle = 'rgba(9,9,11,.82)'; ctx.fillRect(p.x + 1, p.y + 1, w - 2, 47);
            ctx.font = 'bold 13px "Space Grotesk", sans-serif'; ctx.fillStyle = m.color;
            ctx.fillText(`Monitor ${m.id}`, p.x + 9, p.y + 19);
            ctx.fillStyle = '#cbd5e1'; ctx.font = '10px "Space Grotesk", sans-serif';
            ctx.fillText(`${m.widthPx} × ${m.heightPx} · ${m.diagonalIn}″ · ${m.heightPx > m.widthPx ? 'Portrait' : 'Landscape'}`, p.x + 9, p.y + 36);
            ctx.restore();
        });
    }
    function pointerToPhysical(event) {
        const rect = canvas.getBoundingClientRect();
        // getBoundingClientRect includes border and CSS transforms; clientWidth does not.
        const factorX = canvas.offsetWidth / rect.width, factorY = canvas.offsetHeight / rect.height;
        return M.previewToPhysical({ x: (event.clientX - rect.left) * factorX - canvas.clientLeft,
            y: (event.clientY - rect.top) * factorY - canvas.clientTop }, ui.view);
    }
    function setMode(mode) {
        ui.mode = mode;
        document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
        $('wallpaper-hint').textContent = mode === 'arrange' ? 'Drag a display to move it · Nearby edges snap · Hold Alt to position freely · Arrow keys nudge; Shift = 1 inch' :
            'Drag the wallpaper to pan · Scroll over the preview to zoom · Arrow keys nudge; Shift = 1 inch';
        updateStatus(); scheduleDraw();
    }
    function snapMonitor(m, view) {
        const threshold = 7 / view.cssPixelsPerInch, r = M.monitorPhysicalRect(m);
        const xCandidates = [], yCandidates = [];
        scene.monitors.filter(other => other.id !== m.id).forEach(other => {
            const o = M.monitorPhysicalRect(other);
            xCandidates.push(o.x - r.width, o.x + o.width, o.x);
            yCandidates.push(o.y, o.y + o.height - r.height, o.y + (o.height - r.height) / 2,
                o.y - r.height, o.y + o.height);
        });
        function nearest(value, candidates) {
            const sorted = candidates.sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
            return Math.abs(sorted[0] - value) < threshold ? sorted[0] : value;
        }
        m.xIn = nearest(m.xIn, xCandidates); m.yIn = nearest(m.yIn, yCandidates);
    }
    canvas.addEventListener('pointerdown', event => {
        if (ui.busy || event.button !== 0 || !event.isPrimary) return;
        const point = pointerToPhysical(event);
        let target = scene.transform;
        if (ui.mode === 'arrange') {
            const monitor = [...scene.monitors].reverse().find(m => {
                const r = M.monitorPhysicalRect(m);
                return point.x >= r.x && point.x <= r.x + r.width && point.y >= r.y && point.y <= r.y + r.height;
            });
            if (!monitor) return;
            ui.selectedId = monitor.id; target = monitor;
        } else if (!scene.image) return;
        event.preventDefault(); canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
        ui.drag = { pointerId: event.pointerId, point, target, start: { ...target }, view: { ...ui.view } };
        updateStatus(); scheduleDraw();
    });
    canvas.addEventListener('pointermove', event => {
        const drag = ui.drag;
        if (!drag || drag.pointerId !== event.pointerId || ui.busy) return;
        const point = pointerToPhysical(event);
        drag.target.xIn = Math.max(-10000, Math.min(10000, drag.start.xIn + point.x - drag.point.x));
        drag.target.yIn = Math.max(-10000, Math.min(10000, drag.start.yIn + point.y - drag.point.y));
        if (ui.mode === 'arrange') {
            if (!event.altKey) snapMonitor(drag.target, drag.view);
            syncMonitorControls();
        }
        imageChanged();
    });
    function endDrag(event) {
        if (!ui.drag || ui.drag.pointerId !== event.pointerId) return;
        ui.drag = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        layoutChanged();
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => canvas.addEventListener(type, endDrag));
    canvas.addEventListener('wheel', event => {
        if (!scene.image || ui.mode !== 'wallpaper' || ui.busy || ui.drag) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? ui.heightCss : 1);
        const current = scene.transform.inchesPerSourcePixel / fillScale() * 100;
        zoomTo(Math.max(1, Math.min(2000, current * Math.exp(-delta * .001))), pointerToPhysical(event));
    }, { passive: false });
    canvas.addEventListener('keydown', event => {
        if (ui.busy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        const target = ui.mode === 'arrange' ? scene.monitors.find(m => m.id === ui.selectedId) : scene.image ? scene.transform : null;
        if (!target) return;
        event.preventDefault();
        const step = event.shiftKey ? 1 : .1;
        target.xIn += event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
        target.yIn += event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
        target.xIn = Math.max(-10000, Math.min(10000, target.xIn));
        target.yIn = Math.max(-10000, Math.min(10000, target.yIn));
        ui.mode === 'arrange' ? layoutChanged() : imageChanged();
    });

    async function loadFile(file) {
        if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            showToast('Choose a PNG, JPEG, or WebP image.', 'error'); return;
        }
        if (file.size > 250 * 1024 * 1024) { showToast('That file is over 250 MB. Try a smaller source image.', 'error'); return; }
        const generation = ++ui.loadGeneration;
        const url = URL.createObjectURL(file); ui.loadingUrls.add(url);
        const image = new Image();
        try {
            image.src = url;
            await image.decode();
            if (generation !== ui.loadGeneration) return;
            if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 160000000)
                throw new Error('This image is too large for a reliable browser preview. Try fewer than 160 megapixels.');
            scene.image = image;
            scene.transform = M.fitImage(image, scene.monitors, 'fill');
            $('wallpaper-source-name').textContent = file.name;
            $('wallpaper-source-info').textContent = `${image.naturalWidth} × ${image.naturalHeight} · Local processing only`;
            syncEnabled(); imageChanged();
            showToast('Wallpaper loaded. Move one scene behind all your screens.');
        } catch (error) {
            if (generation === ui.loadGeneration) showToast(error.message.startsWith('This image') ? error.message : 'Could not decode that image. Try a valid PNG, JPEG, or WebP.', 'error');
        } finally {
            URL.revokeObjectURL(url); ui.loadingUrls.delete(url);
            $('image-upload').value = '';
        }
    }
    function zoomTo(percent, anchor) {
        if (!scene.image) return;
        if (!Number.isFinite(percent) || percent < 1 || percent > 2000) {
            showToast('Zoom must be between 1% and 2,000%.', 'error'); syncImageControls(); return;
        }
        const b = M.layoutBounds(scene.monitors);
        const center = anchor || { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        scene.transform = M.zoomAtPhysicalPoint(scene.transform, fillScale() * percent / 100, center);
        imageChanged();
    }
    function setImageFit(mode) {
        if (!scene.image) return;
        scene.transform = M.fitImage(scene.image, scene.monitors, mode); imageChanged();
    }
    function clearImage() {
        ++ui.loadGeneration;
        scene.image = null; ui.drag = null;
        scene.transform = { xIn: 0, yIn: 0, inchesPerSourcePixel: 1 };
        $('wallpaper-source-name').textContent = 'Choose one wallpaper to begin';
        $('wallpaper-source-info').textContent = 'Drop an image here or browse · PNG, JPEG, WebP · stays on your device.';
        syncEnabled(); imageChanged();
    }
    function exportSnapshot() {
        return { image: scene.image, monitors: scene.monitors.map(m => ({ ...m })), transform: { ...scene.transform } };
    }
    async function exportMonitorBlob(snapshot, monitor) {
        if (!snapshot.image) throw new Error('Choose a wallpaper first.');
        M.validateMonitor(monitor);
        // Canvas budgets vary by browser. Refuse obvious allocation hazards before drawing.
        if (monitor.widthPx * monitor.heightPx > 64000000 || Math.max(monitor.widthPx, monitor.heightPx) > 16384)
            throw new Error(`Monitor ${monitor.id} exceeds the export budget (64 megapixels, 16,384 px per side). Try a smaller resolution.`);
        const output = document.createElement('canvas');
        try {
            output.width = monitor.widthPx; output.height = monitor.heightPx;
            const exportCtx = output.getContext('2d');
            if (!exportCtx || output.width !== monitor.widthPx || output.height !== monitor.heightPx)
                throw new Error('The browser could not allocate the export canvas. Try a smaller resolution.');
            exportCtx.fillStyle = '#000'; exportCtx.fillRect(0, 0, output.width, output.height);
            // Each output pixel maps back through INCHES into the same master source image.
            // Unlike preview CSS/backing pixels, these coordinates are exactly native pixels.
            M.renderMasterImage(exportCtx, snapshot.image, snapshot.transform, M.outputMapping(monitor));
            const blob = await new Promise((resolve, reject) => {
                output.toBlob(value => value ? resolve(value) : reject(new Error('The browser ran out of memory encoding this PNG. Try a smaller resolution.')), 'image/png');
            });
            return blob;
        } finally {
            // Release each large backing store before encoding the next monitor / assembling ZIP.
            output.width = output.height = 1;
        }
    }
    function filename(monitor) {
        return `wallpaper-monitor${monitor.id}-${monitor.widthPx}x${monitor.heightPx}.png`;
    }
    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob); ui.downloadUrls.add(url);
        const link = document.createElement('a'); link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => { URL.revokeObjectURL(url); ui.downloadUrls.delete(url); }, 30000);
    }
    async function downloadMonitors(id) {
        if (ui.busy || !scene.image) return;
        ui.busy = true; ui.drag = null; syncEnabled();
        const snapshot = exportSnapshot();
        try {
            if (id != null) {
                const monitor = snapshot.monitors.find(m => m.id === id);
                const blob = await exportMonitorBlob(snapshot, monitor);
                downloadBlob(blob, filename(monitor));
                showToast(`Monitor ${id} exported at ${monitor.widthPx} × ${monitor.heightPx}.`);
            } else {
                if (typeof JSZip === 'undefined') throw new Error('ZIP library could not load. Check your connection and reload, or download each monitor individually.');
                const zip = new JSZip();
                for (const monitor of snapshot.monitors) {
                    $('btn-dl-zip').textContent = `Rendering Monitor ${monitor.id}…`;
                    zip.file(filename(monitor), await exportMonitorBlob(snapshot, monitor));
                }
                $('btn-dl-zip').textContent = 'Preparing ZIP…';
                downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), 'wallpaper-monitors.zip');
                showToast('All monitor wallpapers exported as ZIP.');
            }
        } catch (error) {
            showToast(error.message || 'Export failed. Try a smaller resolution or source image.', 'error');
        } finally {
            ui.busy = false; $('btn-dl-zip').textContent = 'Export All as ZIP'; syncEnabled();
        }
    }
    buildMonitorControls();
    $('wallpaper-browse').addEventListener('click', () => $('image-upload').click());
    $('image-upload').addEventListener('change', event => loadFile(event.target.files[0]));
    const uploadZone = $('wallpaper-upload-zone');
    uploadZone.addEventListener('dragover', event => { event.preventDefault(); if (!ui.busy) uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', event => {
        event.preventDefault(); uploadZone.classList.remove('drag-over');
        if (!ui.busy) loadFile(event.dataTransfer.files[0]);
    });
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
    $('wallpaper-grid').addEventListener('change', event => { ui.grid = event.target.checked; scheduleDraw(); });
    $('wallpaper-fit').addEventListener('click', () => setImageFit('fit'));
    $('wallpaper-fill').addEventListener('click', () => setImageFit('fill'));
    $('wallpaper-center').addEventListener('click', () => {
        if (scene.image) { scene.transform = M.centerImage(scene.image, scene.monitors, scene.transform); imageChanged(); }
    });
    $('wallpaper-reset').addEventListener('click', () => setImageFit('fill'));
    $('wallpaper-clear').addEventListener('click', clearImage);
    $('wallpaper-zoom').addEventListener('change', event => zoomTo(Number(event.target.value)));
    $('wallpaper-zoom-slider').addEventListener('input', event => zoomTo(Number(event.target.value)));
    [['wallpaper-x', 'xIn'], ['wallpaper-y', 'yIn']].forEach(([id, key]) => {
        $(id).addEventListener('change', event => {
            const value = event.target.value.trim() === '' ? NaN : Number(event.target.value);
            if (!Number.isFinite(value) || Math.abs(value) > 10000) {
                showToast('Image positions must be finite distances within ±10,000 inches.', 'error'); syncImageControls(); return;
            }
            scene.transform[key] = value;
            $(id).removeAttribute('aria-invalid');
            imageChanged();
        });
    });
    ['left', 'right'].forEach(side => $(`monitor-${side}`).addEventListener('click', () => {
        const [a, b] = scene.monitors, ra = M.monitorPhysicalRect(a), rb = M.monitorPhysicalRect(b);
        b.xIn = side === 'left' ? a.xIn - rb.width : a.xIn + ra.width;
        layoutChanged();
    }));
    ['top', 'center', 'bottom'].forEach(alignment => $(`monitor-${alignment}`).addEventListener('click', () => {
        const [a, b] = scene.monitors, ra = M.monitorPhysicalRect(a), rb = M.monitorPhysicalRect(b);
        b.yIn = a.yIn + (alignment === 'top' ? 0 : alignment === 'bottom' ? ra.height - rb.height : (ra.height - rb.height) / 2);
        layoutChanged();
    }));
    $('monitor-swap').addEventListener('click', () => {
        const bounds = M.layoutBounds(scene.monitors);
        const oldY = scene.monitors.map(m => m.yIn);
        // Mirror physical rectangles, keeping identity, size, and any bezel gap intact.
        scene.monitors.forEach((m, i) => { m.xIn = 2 * bounds.x + bounds.width - m.xIn - M.monitorPhysicalRect(m).width; m.yIn = oldY[oldY.length - 1 - i]; });
        layoutChanged();
    });
    $('monitor-reset').addEventListener('click', () => {
        scene.monitors[0].xIn = 0; scene.monitors[0].yIn = 0;
        M.arrangePair(scene.monitors, 'right', 'center'); layoutChanged();
    });
    $('btn-dl-zip').addEventListener('click', () => downloadMonitors());
    new ResizeObserver(resizePreview).observe(canvas);
    window.addEventListener('resize', resizePreview);
    // Browser zoom can change DPR without a content-box resize. Re-arm the DPR query each time.
    function watchDpr() {
        const media = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
        media.addEventListener('change', () => { resizePreview(); watchDpr(); }, { once: true });
    }
    watchDpr();
    window.addEventListener('pagehide', () => {
        for (const url of [...ui.loadingUrls, ...ui.downloadUrls]) URL.revokeObjectURL(url);
        ui.loadingUrls.clear(); ui.downloadUrls.clear();
    });
    syncMonitorControls(); syncImageControls(); syncEnabled(); resizePreview(); updateStatus();
})();
