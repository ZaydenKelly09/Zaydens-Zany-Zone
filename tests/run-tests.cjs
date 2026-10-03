/* Development-only tests; no installation or build is needed to use the website.
 * Run: node tests/run-tests.cjs <directory-containing-playwright-and-sharp>
 * Uses a headless installed Chrome and a temporary localhost static server. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const packages = process.argv[2];
const { chromium } = require(packages ? path.join(packages, 'playwright') : 'playwright');
const sharp = require(packages ? path.join(packages, 'sharp') : 'sharp');
const M = require('../js/wallpaper-model.js');
const R = require('../js/rsc-model.js');
const F = require('../js/flip-model.js');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const report = { checks: [], errors: [], cases: [], started: new Date().toISOString() };
function check(name) { report.checks.push(name); console.log(`PASS ${name}`); }
function near(a, b, epsilon = 1e-9) { assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`); }
const cases = [
    { name: 'Identical 1080p screens, right, tops', a: [1920, 1080, 24], b: [1920, 1080, 24], side: 'right', align: 'top' },
    { name: '1440p + 1080p, right, centers', a: [2560, 1440, 27], b: [1920, 1080, 24], side: 'right', align: 'center' },
    { name: '1440p landscape + 1080p portrait, centers', a: [2560, 1440, 27], b: [1080, 1920, 24], side: 'right', align: 'center' },
    { name: 'Same resolution, unequal physical sizes', a: [1920, 1080, 27], b: [1920, 1080, 21.5], side: 'right', align: 'bottom' },
    { name: 'Different resolutions and sizes, monitor 2 on LEFT', a: [2560, 1440, 27], b: [1920, 1080, 24], side: 'left', align: 'center' },
    { name: 'Portrait on LEFT and HIGHER, bezel gap', a: [2560, 1440, 27], b: [1080, 1920, 24], side: 'left', align: 'top', y: -4, gap: .5 },
    { name: 'Portrait on RIGHT and LOWER, bezel gap', a: [2560, 1440, 27], b: [1080, 1920, 24], side: 'right', align: 'top', y: 4, gap: .5 },
    { name: 'Mixed density, BOTTOM aligned', a: [3840, 2160, 32], b: [1920, 1080, 24], side: 'right', align: 'bottom' }
];
function monitorsFor(c) {
    const monitors = [c.a, c.b].map(([widthPx, heightPx, diagonalIn], i) => ({ id: i + 1, widthPx, heightPx, diagonalIn, xIn: 0, yIn: 0 }));
    M.arrangePair(monitors, c.side, c.align);
    if (c.y != null) monitors[1].yIn = c.y;
    if (c.gap) monitors[1].xIn += c.side === 'left' ? -c.gap : c.gap;
    return monitors;
}
function mathTests() {
    for (const c of cases) {
        const monitors = monitorsFor(c);
        const transform = { xIn: -50, yIn: -30, inchesPerSourcePixel: .0217 };
        for (const m of monitors) {
            const r = M.monitorPhysicalRect(m);
            near(Math.hypot(r.width, r.height), m.diagonalIn);
            near(r.width / r.height, m.widthPx / m.heightPx);
            const physical = { x: r.x + r.width * .37, y: r.y + r.height * .61 };
            const out = M.physicalToOutput(physical, m);
            const back = M.outputToPhysical(out, m);
            near(back.x, physical.x); near(back.y, physical.y);
            const src = M.physicalToSource(back, transform);
            const matrix = M.sourceToTargetMatrix(transform, M.outputMapping(m));
            near(matrix.a * src.x + matrix.e, out.x); near(matrix.d * src.y + matrix.f, out.y);
            for (const [widthCss, heightCss, dpr] of [[1000, 490, 1], [320, 330, 2], [710, 490, 1.25]]) {
                const view = M.makePreviewView(monitors, widthCss, heightCss);
                const css = M.physicalToPreview(physical, view), backing = M.cssToBacking(css, { xRatio: dpr, yRatio: dpr });
                const restored = M.previewToPhysical({ x: backing.x / dpr, y: backing.y / dpr }, view);
                near(restored.x, physical.x); near(restored.y, physical.y);
            }
        }
        const [a, b] = monitors.map(M.monitorPhysicalRect);
        const samePhysicalY = (Math.max(a.y, b.y) + Math.min(a.y + a.height, b.y + b.height)) / 2;
        // A physical horizon uses identical SOURCE Y on both monitors, independent of density.
        for (const m of monitors) {
            const pixelRow = M.physicalToOutput({ x: m.xIn, y: samePhysicalY }, m).y;
            const physicalRow = M.outputToPhysical({ x: 0, y: pixelRow }, m).y;
            near(M.physicalToSource({ x: m.xIn, y: physicalRow }, transform).y, (samePhysicalY + 30) / .0217);
        }
    }
    assert.throws(() => M.validateMonitor({ ...M.defaults()[0], widthPx: 0 }));
    assert.throws(() => M.validateMonitor({ ...M.defaults()[0], diagonalIn: -1 }));
    assert.throws(() => M.validateMonitor({ ...M.defaults()[0], heightPx: 1080.5 }));
    const t = { xIn: 2, yIn: -3, inchesPerSourcePixel: .01 }, anchor = { x: 7, y: 9 };
    const before = M.physicalToSource(anchor, t), after = M.physicalToSource(anchor, M.zoomAtPhysicalPoint(t, .015, anchor));
    near(before.x, after.x); near(before.y, after.y);
    check('Physical geometry, cross-monitor source equality, five coordinate spaces, fractional DPR, validation, anchored zoom');
}
function rscModelTests() {
    for (const thickness of [.06, .125, .16, .275]) {
        const interior = { l: 12.375, w: 8.25, d: 4.625 };
        const exterior = R.interiorToExterior(interior, thickness);
        near(exterior.l, interior.l + 2 * thickness);
        near(exterior.w, interior.w + 2 * thickness);
        near(exterior.d, interior.d + 4 * thickness);
        const back = R.exteriorToInterior(exterior, thickness);
        for (const key of ['l', 'w', 'd']) near(back[key], interior[key]);
        const again = R.interiorToExterior(back, thickness);
        for (const key of ['l', 'w', 'd']) near(again[key], exterior[key]);
    }
    for (const bad of [{ l: 0, w: 2, d: 2 }, { l: -1, w: 2, d: 2 }, { l: NaN, w: 2, d: 2 }]) assert.throws(() => R.interiorToExterior(bad, .125));
    assert.throws(() => R.interiorToExterior({ l: 2, w: 2, d: 2 }, 0));
    assert.throws(() => R.exteriorToInterior({ l: 1, w: 1, d: .5 }, .125));
    const blank = R.blankFromInterior({ l: 15.5, w: 8.25, d: 6.75 });
    near(blank.overL, 49.5); near(blank.overW, 15);
    assert.deepEqual(blank.hSegments.map(s => s.markAt), [2, 17.5, 25.75, 41.25, 49.5]);
    assert.deepEqual(blank.vSegments.map(s => s.markAt), [4.125, 10.875, 15]);
    assert.equal(blank.hSegments[0].size, 2);
    for (const dimensions of [{ l: .35, w: .25, d: .5 }, { l: 2000, w: 1000, d: 1500 }]) {
        const outside = R.interiorToExterior(dimensions, .06);
        const roundTrip = R.exteriorToInterior(outside, .06);
        for (const key of ['l', 'w', 'd']) near(roundTrip[key], dimensions[key]);
        assert.ok(Number.isFinite(R.blankFromInterior(roundTrip).overL));
    }
    check('RSC inside/outside round trips, thicknesses, decimals, invalid geometry and unchanged blank/score formulas');
}
function flipModelTests() {
    const v = { purchase: 100.25, purchaseTax: 8.5, parts: 15.25, otherBuy: 1, sale: 220.75,
        feePct: 10, fixedFee: .3, adPct: 2, shipping: 12.5, insurance: 1.5, packaging: 2, otherSell: .5 };
    const f = F.calculate(v);
    near(f.invested, 125); near(f.percentageFees, 26.49); near(f.fixedSelling, 16.8);
    near(f.sellingCosts, 43.29); near(f.proceeds, 177.46); near(f.profit, 52.46);
    near(f.roi, 52.46 / 125 * 100); near(f.margin, 52.46 / 220.75 * 100);
    near(f.breakEven, (125 + 16.8) / .88);
    near(F.requiredSale(v, 100), 274.78);
    assert.equal(Object.is(F.requiredSale({}, 0), -0), false);
    near(F.calculate({ purchase: 10, sale: 20, shipping: '' }).profit, 10);
    assert.throws(() => F.calculate({ sale: 100, feePct: 70, adPct: 30 }));
    assert.throws(() => F.calculate({ purchase: -1 }));
    check('Flip profits, ratios, fee algebra and validation');
}
function serverStart() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            const requested = decodeURIComponent(req.url.split('?')[0]);
            if (!requested.startsWith('/zany-zone/')) { res.writeHead(404); res.end(); return; }
            const relative = requested.slice('/zany-zone'.length);
            const filename = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
            if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
            fs.readFile(filename, (error, data) => {
                if (error) { res.writeHead(404); res.end(); return; }
                res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(filename)] || 'application/octet-stream');
                res.end(data);
            });
        }).listen(0, '127.0.0.1', () => resolve(server));
    });
}
async function input(page, id, value) {
    const field = page.locator('#' + id);
    await field.evaluate(el => { for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true; });
    await page.locator('#' + id).fill(String(value));
    await page.locator('#' + id).dispatchEvent('change');
}
async function clickControl(page, id) {
    const button = page.locator('#' + id);
    await button.evaluate(el => { for (let parent = el.parentElement; parent; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true; });
    await button.click();
}
async function generateImage(page, width, height) {
    const base64 = await page.evaluate(({ width, height }) => {
        const c = document.createElement('canvas'); c.width = width; c.height = height;
        const ctx = c.getContext('2d');
        const pixels = ctx.createImageData(width, height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            pixels.data[i] = Math.round(x / (width - 1) * 220);
            pixels.data[i + 1] = Math.round(y / (height - 1) * 220);
            pixels.data[i + 2] = 75; pixels.data[i + 3] = 255;
        }
        ctx.putImageData(pixels, 0, 0);
        ctx.strokeStyle = 'white'; ctx.lineWidth = Math.max(3, width / 900); ctx.beginPath();
        for (let x = 0; x < width; x += width / 16) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
        for (let y = 0; y < height; y += height / 12) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
        ctx.stroke(); ctx.strokeStyle = '#facc15'; ctx.lineWidth *= 2;
        ctx.beginPath(); ctx.moveTo(0, height * .15); ctx.lineTo(width, height * .85); ctx.stroke();
        ctx.strokeStyle = '#a5f3fc'; ctx.beginPath(); ctx.arc(width * .52, height * .47, height * .29, 0, Math.PI * 2); ctx.stroke();
        return c.toDataURL('image/png').split(',')[1];
    }, { width, height });
    return Buffer.from(base64, 'base64');
}
async function upload(page, buffer, name) {
    await page.locator('#image-upload').setInputFiles({ name, mimeType: 'image/png', buffer });
    await page.waitForFunction(name => document.getElementById('wallpaper-source-name').textContent === name, name);
    await page.locator('#btn-dl-m1').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#btn-dl-m1').isDisabled(), false);
}
async function download(page, id) {
    const pending = page.waitForEvent('download', { timeout: 60000 });
    await page.locator('#' + id).click();
    const download = await pending;
    const filename = download.suggestedFilename();
    const buffer = fs.readFileSync(await download.path());
    await page.waitForFunction(() => !document.getElementById('btn-dl-zip').disabled);
    return { filename, buffer };
}
async function configure(page, c) {
    for (let i = 0; i < 2; i++) {
        const values = i ? c.b : c.a;
        for (let j = 0; j < 3; j++) await input(page, `m${i + 1}-${['widthPx', 'heightPx', 'diagonalIn'][j]}`, values[j]);
    }
    await clickControl(page, 'monitor-reset');
    await page.locator('#monitor-' + c.side).click();
    await clickControl(page, 'monitor-' + c.align);
    if (c.y != null) await input(page, 'm2-yIn', c.y);
    if (c.gap) {
        const current = Number(await page.locator('#m2-xIn').inputValue());
        await input(page, 'm2-xIn', current + (c.side === 'left' ? -c.gap : c.gap));
    }
    const coordinateValidity = await page.locator('#m2-xIn').evaluate(input => ({ valid: input.validity.valid, stepMismatch: input.validity.stepMismatch }));
    assert.deepEqual(coordinateValidity, { valid: true, stepMismatch: false }, 'Negative decimal monitor coordinates should pass native input validation.');
}
async function decode(buffer) { return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
function pixel(raw, x, y) {
    const i = (Math.floor(y) * raw.info.width + Math.floor(x)) * 4;
    return Array.from(raw.data.subarray(i, i + 4));
}
// Independent oracle: no WallpaperMath conversion or renderer is used here.
// Sample output pixel centers -> physical inches -> source pixel centers.
async function verifyPng(outputBuffer, sourceRaw, m, t) {
    const output = await decode(outputBuffer);
    assert.equal(output.info.width, m.widthPx); assert.equal(output.info.height, m.heightPx);
    const physicalWidth = m.diagonalIn * m.widthPx / Math.hypot(m.widthPx, m.heightPx);
    const physicalHeight = m.diagonalIn * m.heightPx / Math.hypot(m.widthPx, m.heightPx);
    let tested = 0, maxError = 0;
    for (let fy = .08; fy < .95; fy += .071) for (let fx = .08; fx < .95; fx += .083) {
        const ox = Math.floor(m.widthPx * fx), oy = Math.floor(m.heightPx * fy);
        const sx = (m.xIn + (ox + .5) / m.widthPx * physicalWidth - t.xIn) / t.scale;
        const sy = (m.yIn + (oy + .5) / m.heightPx * physicalHeight - t.yIn) / t.scale;
        const actual = pixel(output, ox, oy);
        if (sx < -2 || sy < -2 || sx > sourceRaw.info.width + 2 || sy > sourceRaw.info.height + 2) {
            assert.deepEqual(actual, [0, 0, 0, 255]); tested++; continue;
        }
        if (sx < 5 || sy < 5 || sx >= sourceRaw.info.width - 5 || sy >= sourceRaw.info.height - 5) continue;
        // Avoid interpolation across narrow diagnostic strokes; test the coordinate-encoded field.
        const patch = [pixel(sourceRaw, sx - 3, sy), pixel(sourceRaw, sx + 3, sy), pixel(sourceRaw, sx, sy - 3), pixel(sourceRaw, sx, sy + 3)];
        if (patch.some(p => p[2] !== 75)) continue;
        const expected = pixel(sourceRaw, sx, sy);
        const error = Math.max(...actual.slice(0, 3).map((v, i) => Math.abs(v - expected[i])));
        maxError = Math.max(maxError, error);
        assert.ok(error <= 3, `Export coordinate error ${error} at ${ox},${oy}; source ${sx},${sy}`);
        tested++;
    }
    assert.ok(tested > 60, `Only ${tested} oracle samples`);
    return { tested, maxError };
}
async function visualReconstruction(page, outputs, source, monitors, transform) {
    const bounds = M.layoutBounds(monitors), scale = 26;
    const width = Math.ceil(bounds.width * scale), height = Math.ceil(bounds.height * scale);
    const pieces = [];
    for (let i = 0; i < outputs.length; i++) {
        const r = M.monitorPhysicalRect(monitors[i]);
        const w = Math.round(r.width * scale), h = Math.round(r.height * scale);
        const image = await sharp(outputs[i]).resize(w, h).png().toBuffer();
        pieces.push({ input: image, left: Math.round((r.x - bounds.x) * scale), top: Math.round((r.y - bounds.y) * scale) });
    }
    const reconstructed = await sharp({ create: { width: width + 2, height: height + 2, channels: 4, background: '#090b12' } }).composite(pieces).png().toBuffer();
    const oracleBase64 = await page.evaluate(async ({ source, monitors, bounds, transform, scale, width, height }) => {
        const image = new Image(); image.src = 'data:image/png;base64,' + source; await image.decode();
        const c = document.createElement('canvas'); c.width = width + 2; c.height = height + 2;
        const ctx = c.getContext('2d'); ctx.fillStyle = '#090b12'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.beginPath();
        for (const m of monitors) {
            const diagonalPx = Math.hypot(m.widthPx, m.heightPx);
            ctx.rect((m.xIn - bounds.x) * scale, (m.yIn - bounds.y) * scale, m.diagonalIn * m.widthPx / diagonalPx * scale, m.diagonalIn * m.heightPx / diagonalPx * scale);
        }
        ctx.clip(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(image, (transform.xIn - bounds.x) * scale, (transform.yIn - bounds.y) * scale,
            image.width * transform.scale * scale, image.height * transform.scale * scale);
        return c.toDataURL('image/png').split(',')[1];
    }, { source: source.toString('base64'), monitors, bounds, transform, scale, width, height });
    const oracle = Buffer.from(oracleBase64, 'base64');
    fs.writeFileSync(path.join(artifacts, 'physical-export-reconstruction.png'), reconstructed);
    fs.writeFileSync(path.join(artifacts, 'independent-physical-reference.png'), oracle);
    const text = Buffer.from(`<svg width="${width + 30}" height="60"><style>text{font:16px sans-serif;fill:#e9d5ff}</style><text x="15" y="25">Independent physical reference</text><text x="15" y="50">Exported PNGs resized to the same inches below</text></svg>`);
    await sharp({ create: { width: width + 30, height: height * 2 + 110, channels: 4, background: '#090b12' } })
        .composite([{ input: text, top: 0, left: 0 }, { input: oracle, top: 65, left: 14 }, { input: reconstructed, top: height + 85, left: 14 }])
        .png().toFile(path.join(artifacts, 'cross-monitor-alignment.png'));
}
async function browserTests() {
    const server = await serverStart();
    const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1.25, acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('requestfailed', request => console.log(`REQUEST FAILED ${request.url()}: ${request.failure()?.errorText}`));
    try {
        const site = `http://127.0.0.1:${server.address().port}/zany-zone/`;
        await page.goto(site, { waitUntil: 'networkidle', timeout: 60000 });
        assert.equal(await page.locator('#home-title').textContent(), "Zayden's Zany Zone");
        assert.equal(await page.locator('.tool-card').count(), 3);
        assert.ok((await page.locator('.hero-tagline').textContent()).includes('Oddly useful tools for oddly specific problems.'));
        await page.locator('.hero').screenshot({ path: path.join(artifacts, 'homepage-hero.png') });
        const wallpaperNav = page.locator('.desktop-links a[href="wallpaper.html"]');
        await wallpaperNav.hover();
        assert.equal(await page.locator('#wallpaper-nav-description').isVisible(), true);
        await wallpaperNav.focus();
        await page.mouse.move(0, 0);
        assert.equal(await page.locator('#wallpaper-nav-description').isVisible(), true);
        await page.locator('.desktop-links a[href="index.html"]').focus();
        assert.equal(await page.locator('#wallpaper-nav-description').isVisible(), false);
        await page.locator('.desktop-links a[href="flip-profit.html"]').hover();
        assert.equal(await page.locator('#flip-nav-description').isVisible(), true);
        check('Homepage directory and desktop hover/focus tool descriptions');
        await page.locator('.tool-card[href="flip-profit.html"]').click();
        assert.equal(page.url(), site + 'flip-profit.html');
        await input(page, 'flip-feePct', 10); await input(page, 'flip-fixedFee', .3); await input(page, 'flip-shipping', 10);
        assert.equal(await page.locator('#flip-profit').textContent(), '$69.70');
        assert.equal(await page.locator('#flip-roi').textContent(), '69.7%');
        assert.equal(await page.locator('#flip-margin').textContent(), '34.8%');
        assert.equal(await page.locator('#flip-break-even').textContent(), '$122.56');
        assert.equal(await page.locator('#flip-required').textContent(), '$233.67');
        await input(page, 'flip-offer', 250);
        assert.ok((await page.locator('#flip-offer-result').textContent()).includes('$114.70 profit'));
        await page.locator('.flip-page').screenshot({ path: path.join(artifacts, 'flip-desktop.png') });
        await page.locator('#flip-fee-preset').selectOption('none');
        assert.equal(await page.locator('#flip-feePct').inputValue(), '0');
        await input(page, 'flip-feePct', 10);
        await input(page, 'flip-preset-name', 'My fees'); await page.locator('#flip-save-preset').click();
        assert.equal(await page.locator('#flip-fee-preset').inputValue(), 'saved-0');
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await page.locator('#flip-fee-preset option[data-saved]').count(), 1);
        assert.equal(await page.locator('#flip-profit').textContent(), '$70.00');
        await input(page, 'flip-adPct', 90);
        assert.equal(await page.locator('#flip-error').isVisible(), true);
        await page.locator('#flip-reset').click();
        assert.equal(await page.locator('#flip-error').isVisible(), false);
        assert.equal(await page.locator('#flip-profit').textContent(), '$0.00');
        assert.equal(await page.locator('#flip-break-even').textContent(), '$0.00');
        check('Flip live profit, ROI/margin, break-even and target algebra, offer, fee presets, persistence and validation');
        await page.locator('.desktop-links a[href="index.html"]').click();
        await page.locator('.tool-card[href="wallpaper.html"]').click();
        assert.equal(page.url(), site + 'wallpaper.html');
        await page.waitForFunction(() => typeof JSZip !== 'undefined' && typeof WallpaperMath !== 'undefined');
        assert.equal(await page.locator('#btn-dl-m1').isDisabled(), true);
        check('Homepage card opens wallpaper page under a repository subdirectory');
        const source = await generateImage(page, 3840, 2160), sourceRaw = await decode(source);
        fs.writeFileSync(path.join(artifacts, 'alignment-source-3840x2160.png'), source);
        await upload(page, source, 'alignment-source-3840x2160.png');
        await input(page, 'm2-xIn', -0.12345);
        const negativePrecision = await page.locator('#m2-xIn').evaluate(input => ({ value: input.value, valid: input.validity.valid, stepMismatch: input.validity.stepMismatch }));
        assert.deepEqual(negativePrecision, { value: '-0.12345', valid: true, stepMismatch: false }, 'The precise position field should accept negative decimal inches at arbitrary step precision.');
        await clickControl(page, 'monitor-reset');
        check('Negative, five-decimal monitor positions pass native number-input validation');
        for (const [index, c] of cases.entries()) {
            await configure(page, c);
            await page.locator('#wallpaper-fill').click();
            await input(page, 'wallpaper-zoom', 125);
            await input(page, 'wallpaper-x', -3.125);
            await input(page, 'wallpaper-y', -6.25);
            assert.equal(await page.locator('#wallpaper-x').evaluate(input => input.validity.valid && !input.validity.stepMismatch), true);
            assert.equal(await page.locator('#wallpaper-y').evaluate(input => input.validity.valid && !input.validity.stepMismatch), true);
            const monitors = monitorsFor(c);
            // Read positions actually accepted by the UI, including precise decimal field edits.
            for (const m of monitors) {
                m.xIn = Number(await page.locator(`#m${m.id}-xIn`).inputValue());
                m.yIn = Number(await page.locator(`#m${m.id}-yIn`).inputValue());
            }
            const b = M.layoutBounds(monitors);
            const t = { xIn: -3.125, yIn: -6.25, scale: Math.max(b.width / 3840, b.height / 2160) * 1.25 };
            const outputs = [], results = [];
            for (const m of monitors) {
                const out = await download(page, `btn-dl-m${m.id}`);
                assert.equal(out.filename, `wallpaper-monitor${m.id}-${m.widthPx}x${m.heightPx}.png`);
                results.push(await verifyPng(out.buffer, sourceRaw, m, t)); outputs.push(out.buffer);
            }
            report.cases.push({ name: c.name, monitors, transform: t, samples: results });
            check(c.name + ': both actual downloads, exact PNG dimensions, independent pixel oracle');
        }
        // Put the test circle directly across the physical seam of the offset portrait setup.
        // Check WHITE horizontal feature crossings in actual output pixels, as well as gradients.
        await configure(page, cases[5]); await input(page, 'wallpaper-zoom', 125);
        const seamMonitors = monitorsFor(cases[5]);
        for (const m of seamMonitors) {
            m.xIn = Number(await page.locator(`#m${m.id}-xIn`).inputValue());
            m.yIn = Number(await page.locator(`#m${m.id}-yIn`).inputValue());
        }
        const seamBounds = M.layoutBounds(seamMonitors), seamScale = Math.max(seamBounds.width / 3840, seamBounds.height / 2160) * 1.25;
        const seamY = M.monitorPhysicalRect(seamMonitors[0]).height / 2;
        const seamTransform = { xIn: -3840 * .52 * seamScale, yIn: seamY - 2160 * .47 * seamScale, scale: seamScale };
        await input(page, 'wallpaper-x', seamTransform.xIn); await input(page, 'wallpaper-y', seamTransform.yIn);
        const seamOutputs = [];
        for (const m of seamMonitors) {
            const buffer = (await download(page, `btn-dl-m${m.id}`)).buffer;
            await verifyPng(buffer, sourceRaw, m, seamTransform); seamOutputs.push(buffer);
            const raw = await decode(buffer), r = M.monitorPhysicalRect(m);
            // Select a horizontal grid line within the shared vertical extent.
            const sourceY = Math.round((seamY - seamTransform.yIn) / seamScale / 180) * 180;
            const featureYIn = seamTransform.yIn + sourceY * seamScale;
            const expectedRow = (featureYIn - m.yIn) / r.height * m.heightPx;
            assert.ok(expectedRow > 10 && expectedRow < m.heightPx - 10);
            const column = Math.floor(m.widthPx * .63);
            const whiteRows = [];
            for (let row = Math.floor(expectedRow) - 5; row <= Math.ceil(expectedRow) + 5; row++) {
                const p = pixel(raw, column, row);
                if (p[0] > 230 && p[1] > 230 && p[2] > 230) whiteRows.push(row);
            }
            assert.ok(whiteRows.length > 0, `Missing physical horizontal crossing on monitor ${m.id}`);
            const actualRow = whiteRows.reduce((sum, row) => sum + row + .5, 0) / whiteRows.length;
            near(m.yIn + actualRow * r.height / m.heightPx, featureYIn, r.height / m.heightPx * 2);
        }
        fs.writeFileSync(path.join(artifacts, 'wallpaper-monitor1-2560x1440.png'), seamOutputs[0]);
        fs.writeFileSync(path.join(artifacts, 'wallpaper-monitor2-1080x1920.png'), seamOutputs[1]);
        await visualReconstruction(page, seamOutputs, source, seamMonitors, seamTransform);
        report.featureCrossing = { monitors: seamMonitors, transform: seamTransform, tolerance: '2 native pixels per display, converted to inches' };
        check('Actual grid-line crossings share physical height; circle/diagonal cross offset, unequal-density portrait seam; independent visual reconstruction');
        // Real pointer pan and wheel zoom. A resize must preserve byte-identical PNGs.
        await configure(page, cases[2]); await page.locator('#wallpaper-fill').click();
        await page.locator('#wallpaper-canvas').scrollIntoViewIfNeeded();
        const box = await page.locator('#wallpaper-canvas').boundingBox();
        await page.mouse.move(box.x + box.width * .4, box.y + box.height * .6);
        await page.mouse.down(); await page.mouse.move(box.x + box.width * .47, box.y + box.height * .65, { steps: 8 }); await page.mouse.up();
        assert.notEqual(Number(await page.locator('#wallpaper-x').inputValue()), 0);
        for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -35); await page.mouse.wheel(0, 20); }
        await page.waitForTimeout(200);
        const before = await download(page, 'btn-dl-m1');
        const positionBefore = await page.locator('#wallpaper-x').inputValue();
        await page.setViewportSize({ width: 820, height: 980 }); await page.waitForTimeout(150);
        const after = await download(page, 'btn-dl-m1');
        assert.equal(crypto.createHash('sha256').update(before.buffer).digest('hex'), crypto.createHash('sha256').update(after.buffer).digest('hex'));
        assert.equal(await page.locator('#wallpaper-x').inputValue(), positionBefore);
        const backing = await page.locator('#wallpaper-canvas').evaluate(c => ({ width: c.width, cssWidth: c.clientWidth, dpr: devicePixelRatio }));
        assert.equal(backing.width, Math.round(backing.cssWidth * backing.dpr));
        check('Repeated real pointer panning/wheel zoom; resize keeps byte-identical export; fractional DPR backing store');
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 980, deviceScaleFactor: 2, mobile: false });
        await page.locator('#wallpaper-grid').check(); // Native Chrome emulation may defer DPR events until rendering.
        await page.waitForFunction(() => document.getElementById('wallpaper-canvas').width === Math.round(document.getElementById('wallpaper-canvas').clientWidth * 2));
        const dprExport = await download(page, 'btn-dl-m1');
        assert.ok(dprExport.buffer.equals(after.buffer));
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        await page.setViewportSize({ width: 820, height: 980 });
        check('DPR changes after positioning keep byte-identical native PNG and update backing store');
        // Actual ZIP download; decode archive in browser using the real loaded dependency.
        const zip = await download(page, 'btn-dl-zip');
        assert.equal(zip.filename, 'wallpaper-monitors.zip');
        const contents = await page.evaluate(async base64 => {
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const archive = await JSZip.loadAsync(bytes);
            const result = [];
            for (const name of Object.keys(archive.files)) {
                const blob = await archive.file(name).async('blob'), bitmap = await createImageBitmap(blob);
                result.push({ name, width: bitmap.width, height: bitmap.height }); bitmap.close();
            }
            return result;
        }, zip.buffer.toString('base64'));
        assert.deepEqual(contents, [{ name: 'wallpaper-monitor1-2560x1440.png', width: 2560, height: 1440 }, { name: 'wallpaper-monitor2-1080x1920.png', width: 1080, height: 1920 }]);
        check('Actual ZIP download contains both exact native-resolution PNGs');
        // Arrange mode and keyboard: real drag selects a monitor and leaves image transform alone.
        const imageX = await page.locator('#wallpaper-x').inputValue();
        await page.locator('#arrange-mode').click();
        await page.locator('#wallpaper-canvas').scrollIntoViewIfNeeded();
        const dragPosition = await page.locator('#wallpaper-canvas').evaluate(c => {
            const m = { id: 1, widthPx: Number(document.getElementById('m1-widthPx').value), heightPx: Number(document.getElementById('m1-heightPx').value), diagonalIn: Number(document.getElementById('m1-diagonalIn').value), xIn: Number(document.getElementById('m1-xIn').value), yIn: Number(document.getElementById('m1-yIn').value) };
            const b = { id: 2, widthPx: Number(document.getElementById('m2-widthPx').value), heightPx: Number(document.getElementById('m2-heightPx').value), diagonalIn: Number(document.getElementById('m2-diagonalIn').value), xIn: Number(document.getElementById('m2-xIn').value), yIn: Number(document.getElementById('m2-yIn').value) };
            const view = WallpaperMath.makePreviewView([m, b], c.clientWidth, c.clientHeight), r = WallpaperMath.monitorPhysicalRect(m);
            const p = WallpaperMath.physicalToPreview({ x: r.x + r.width / 2, y: r.y + r.height / 2 }, view), bounds = c.getBoundingClientRect();
            return { x: bounds.x + c.clientLeft + p.x, y: bounds.y + c.clientTop + p.y, pixelsPerInch: view.cssPixelsPerInch };
        });
        const monitorYBefore = Number(await page.locator('#m1-yIn').inputValue());
        await page.keyboard.down('Alt');
        await page.mouse.move(dragPosition.x, dragPosition.y); await page.mouse.down();
        await page.mouse.move(dragPosition.x, dragPosition.y + dragPosition.pixelsPerInch * 1.5, { steps: 5 });
        await page.mouse.up(); await page.keyboard.up('Alt');
        near(Number(await page.locator('#m1-yIn').inputValue()), monitorYBefore + 1.5, .0002);
        assert.equal(await page.locator('#wallpaper-x').inputValue(), imageX);
        check('Actual monitor pointer drag moves 1.5 physical inches and preserves wallpaper transform');
        await page.locator('#wallpaper-canvas').focus(); await page.keyboard.press('Shift+ArrowDown');
        assert.equal(await page.locator('#wallpaper-x').inputValue(), imageX);
        const m1Before = Number(await page.locator('#m1-yIn').inputValue());
        await page.keyboard.press('ArrowUp'); near(Number(await page.locator('#m1-yIn').inputValue()), m1Before - .1, .0001);
        await clickControl(page, 'monitor-swap');
        assert.ok(Number(await page.locator('#m2-xIn').inputValue()) < Number(await page.locator('#m1-xIn').inputValue()));
        await page.locator('#m2-orientation').selectOption('landscape');
        assert.equal(await page.locator('#m2-widthPx').inputValue(), '1920');
        assert.equal(await page.locator('#m2-heightPx').inputValue(), '1080');
        check('Keyboard arrangement, swap positions, orientation rotates native dimensions and preserves master image');
        await input(page, 'm1-widthPx', 0); assert.equal(await page.locator('#m1-widthPx').inputValue(), '2560');
        await input(page, 'm1-diagonalIn', -2); assert.equal(await page.locator('#m1-diagonalIn').inputValue(), '27');
        await input(page, 'wallpaper-zoom', 0); assert.notEqual(await page.locator('#wallpaper-zoom').inputValue(), '0');
        await input(page, 'm1-widthPx', 20000);
        const denied = page.waitForEvent('download', { timeout: 1200 }).then(() => true).catch(() => false);
        await page.locator('#btn-dl-m1').click(); assert.equal(await denied, false);
        assert.ok((await page.locator('#toast-container').textContent()).includes('export budget'));
        await input(page, 'm1-widthPx', 2560);
        await page.locator('#image-upload').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
        await page.waitForTimeout(200);
        assert.equal(await page.locator('#wallpaper-source-name').textContent(), 'alignment-source-3840x2160.png');
        check('Invalid dimensions/size/zoom restored with errors; oversized export and corrupt source fail gracefully');
        await page.locator('#wallpaper-mode').click();
        for (const [width, height] of [[8192, 4096], [640, 360]]) {
            const testSource = await generateImage(page, width, height), raw = await decode(testSource);
            await configure(page, cases[2]); await upload(page, testSource, `grid-${width}x${height}.png`);
            const monitors = monitorsFor(cases[2]), bounds = M.layoutBounds(monitors);
            const scale = Math.max(bounds.width / width, bounds.height / height);
            await input(page, 'wallpaper-x', 0); await input(page, 'wallpaper-y', 0);
            for (const m of monitors) await verifyPng((await download(page, `btn-dl-m${m.id}`)).buffer, raw, m, { xIn: 0, yIn: 0, scale });
            await page.locator('#wallpaper-fit').click();
            assert.ok((await page.locator('#wallpaper-status').textContent()).includes('black'));
            await page.locator('#wallpaper-center').click(); await page.locator('#wallpaper-reset').click();
            near(Number(await page.locator('#wallpaper-zoom').inputValue()), 100, .001);
            check(`${width} × ${height} source: up/downscaling, native exports, fit/center/reset`);
        }
        await upload(page, source, 'alignment-source-3840x2160.png'); await page.locator('#wallpaper-grid').check();
        await page.locator('#wallpaper-clear').click(); assert.equal(await page.locator('#btn-dl-m1').isDisabled(), true);
        check('Removing the image disables wallpaper exports');
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.locator('#tool-wallpaper details').evaluateAll(details => details.forEach(detail => { detail.open = false; }));
        await page.locator('#tool-wallpaper').screenshot({ path: path.join(artifacts, 'wallpaper-desktop.png') });
        await page.locator('.desktop-links a[href="rsc-box.html"]').click();
        assert.equal(page.url(), site + 'rsc-box.html');
        await page.waitForFunction(() => document.getElementById('rsc-out-length')?.textContent !== '--');
        assert.equal(await page.locator('#rsc-out-length').textContent(), '46.00"');
        assert.equal(await page.locator('#rsc-out-width').textContent(), '15.00"');
        check('Wallpaper navigation opens RSC page with unchanged default calculations');
        // Regression: calculations stay unchanged, including fractional dimensions and glue tab.
        const oldSvg = await page.locator('#svg-container').innerHTML();
        for (const [id, value] of [['rsc-l', 15.5], ['rsc-w', 8.25], ['rsc-d', 6.75]]) {
            await page.locator('#' + id).fill(String(value)); await page.locator('#' + id).dispatchEvent('input');
        }
        assert.equal(await page.locator('#rsc-out-length').textContent(), '49.50"');
        assert.equal(await page.locator('#rsc-out-width').textContent(), '15.00"');
        assert.deepEqual(await page.locator('#rsc-h-table .rsc-mark').allTextContents(), ['2.00"', '17.50"', '25.75"', '41.25"', '49.50"']);
        assert.deepEqual(await page.locator('#rsc-h-table .rsc-size').allTextContents(), ['2.00"', '15.50"', '8.25"', '15.50"', '8.25"']);
        assert.deepEqual(await page.locator('#rsc-v-table .rsc-mark').allTextContents(), ['4.13"', '10.88"', '15.00"']);
        assert.deepEqual(await page.locator('#rsc-v-table .rsc-size').allTextContents(), ['4.13"', '6.75"', '4.13"']);
        const newSvg = await page.locator('#svg-container').innerHTML(); assert.notEqual(newSvg, oldSvg);
        for (const expected of ['GLUE TAB', 'Top Flap', 'Bottom Flap', 'Length panel', 'Width panel', 'stroke-dasharray', '#f43f5e']) assert.ok(newSvg.includes(expected));
        for (const id of ['rsc-h-table', 'rsc-v-table']) {
            const styles = await page.locator('#' + id).evaluate(table => {
                const mark = getComputedStyle(table.querySelector('.rsc-mark')), size = getComputedStyle(table.querySelector('.rsc-size'));
                return { mark: parseFloat(mark.fontSize), size: parseFloat(size.fontSize), weight: mark.fontWeight, color: mark.color, sizeColor: size.color };
            });
            assert.ok(styles.mark >= styles.size * 1.75); assert.equal(styles.weight, '700'); assert.notEqual(styles.color, styles.sizeColor);
        }
        assert.equal(await page.getByText('Cumulative', { exact: true }).count(), 0);
        check('RSC fractional inputs, formulas, segments, MARK AT positions, SVG cuts/scores/glue/panels, dominant number hierarchy');
        const interiorBefore = await Promise.all(['l', 'w', 'd'].map(axis => page.locator(`#rsc-${axis}`).inputValue()));
        await page.locator('input[name="rsc-basis"][value="exterior"]').check();
        assert.deepEqual(await Promise.all(['l', 'w', 'd'].map(axis => page.locator(`#rsc-${axis}`).inputValue())), ['15.75', '8.5', '7.25']);
        assert.equal(await page.locator('#rsc-out-length').textContent(), '49.50"');
        for (let i = 0; i < 6; i++) {
            await page.locator('input[name="rsc-basis"][value="interior"]').check();
            await page.locator('input[name="rsc-basis"][value="exterior"]').check();
        }
        await page.locator('input[name="rsc-basis"][value="interior"]').check();
        assert.deepEqual(await Promise.all(['l', 'w', 'd'].map(axis => page.locator(`#rsc-${axis}`).inputValue())), interiorBefore);
        await page.locator('input[name="rsc-basis"][value="exterior"]').check();
        for (const [id, value] of [['rsc-l', 12], ['rsc-w', 9], ['rsc-d', 4]]) await input(page, id, value);
        assert.equal(await page.locator('#rsc-interior').textContent(), '11.75" × 8.75" × 3.50"');
        assert.equal(await page.locator('#rsc-out-length').textContent(), '43.00"');
        await page.locator('#rsc-preset').selectOption('0.16');
        assert.equal(await page.locator('#rsc-interior').textContent(), '11.68" × 8.68" × 3.36"');
        assert.equal(await page.locator('#rsc-out-length').textContent(), '42.72"');
        assert.equal(await page.locator('#rsc-thickness-mm').textContent(), '≈ 4.06 mm');
        await input(page, 'rsc-thickness', .2);
        assert.equal(await page.locator('#rsc-preset').inputValue(), 'custom');
        assert.equal(await page.locator('#rsc-interior').textContent(), '11.60" × 8.60" × 3.20"');
        await input(page, 'rsc-d', .5);
        assert.equal(await page.locator('#rsc-error').isVisible(), true);
        assert.ok((await page.locator('#rsc-error').textContent()).includes('Exterior depth'));
        assert.equal(await page.locator('#rsc-out-length').textContent(), '—');
        await input(page, 'rsc-d', 4);
        await input(page, 'rsc-thickness', 0);
        assert.ok((await page.locator('#rsc-error').textContent()).includes('greater than zero'));
        await input(page, 'rsc-thickness', .125);
        assert.equal(await page.locator('#rsc-error').isVisible(), false);
        const panelBefore = Number(await page.locator('.rsc-net rect').nth(1).getAttribute('width'));
        await input(page, 'rsc-l', 30);
        const panelAfter = Number(await page.locator('.rsc-net rect').nth(1).getAttribute('width'));
        assert.ok(panelAfter > panelBefore, 'The diagram should respond to panel dimensions.');
        await input(page, 'rsc-l', 12);
        check('RSC mode switching preserves the box, thickness updates the blank, and invalid geometry is reported inline');
        await page.locator('#rsc-thickness').evaluate(el => el.blur());
        await page.locator('#tool-rsc').screenshot({ path: path.join(artifacts, 'rsc-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'RSC page must not overflow the mobile viewport');
        assert.ok(await page.locator('.rsc-diagram-surface').isVisible());
        assert.equal(await page.locator('.rsc-scroll-hint').isVisible(), true);
        assert.ok(await page.locator('.rsc-diagram-surface').evaluate(el => el.scrollWidth > el.clientWidth));
        await page.locator('#tool-rsc').screenshot({ path: path.join(artifacts, 'rsc-mobile.png') });
        assert.equal(await page.locator('.desktop-links').isVisible(), false);
        await page.locator('.mobile-nav summary').click();
        assert.equal(await page.locator('.mobile-menu a[href="wallpaper.html"] small').isVisible(), true);
        await page.locator('.mobile-menu a[href="wallpaper.html"]').click();
        assert.equal(page.url(), site + 'wallpaper.html');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('#tool-wallpaper').screenshot({ path: path.join(artifacts, 'wallpaper-mobile.png') });
        await page.locator('.mobile-nav summary').click();
        await page.locator('.mobile-menu a[href="index.html"]').click();
        assert.equal(page.url(), site + 'index.html');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('.mobile-nav summary').click();
        assert.equal(await page.locator('.mobile-menu a[href="flip-profit.html"] small').isVisible(), true);
        await page.locator('.mobile-menu a[href="flip-profit.html"]').click();
        assert.equal(page.url(), site + 'flip-profit.html');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('.flip-page').screenshot({ path: path.join(artifacts, 'flip-mobile.png') });
        await page.locator('.mobile-nav summary').click();
        await page.locator('.mobile-menu a[href="rsc-box.html"]').click();
        assert.equal(page.url(), site + 'rsc-box.html');
        await page.setViewportSize({ width: 1440, height: 1100 });
        await page.locator('.desktop-links a[href="index.html"]').click();
        assert.equal(page.url(), site + 'index.html');
        check('Desktop/mobile navigation works from all pages under subdirectory; descriptions visible on touch; no horizontal overflow');
        assert.deepEqual(report.errors, []); check('No browser JavaScript errors');
    } finally {
        await browser.close(); await new Promise(resolve => server.close(resolve));
    }
}
(async () => {
    try { mathTests(); rscModelTests(); flipModelTests(); await browserTests(); report.status = 'passed'; }
    catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
    finally { report.finished = new Date().toISOString(); fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2)); }
})();
