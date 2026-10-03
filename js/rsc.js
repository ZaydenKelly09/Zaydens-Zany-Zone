/* RSC page controller. Geometry and legacy blank formulas live in rsc-model.js. */
(() => {
    'use strict';
    const model = RSCModel;
    const ids = id => document.getElementById(id);
    const fields = { l: ids('rsc-l'), w: ids('rsc-w'), d: ids('rsc-d') };
    const els = {
        thickness: ids('rsc-thickness'), preset: ids('rsc-preset'), mm: ids('rsc-thickness-mm'),
        error: ids('rsc-error'), interior: ids('rsc-interior'), exterior: ids('rsc-exterior'),
        outL: ids('rsc-out-length'), outW: ids('rsc-out-width'),
        hTable: ids('rsc-h-table'), vTable: ids('rsc-v-table'), svg: ids('svg-container')
    };
    const state = { mode: 'interior', exactInterior: null };
    const display = n => `${n.toFixed(2)}"`;
    const triplet = d => `${display(d.l)} × ${display(d.w)} × ${display(d.d)}`;
    // Keep mode-switch inputs much more precise than the two-decimal hand-marking display.
    const fieldValue = n => String(Number(n.toPrecision(13)));
    const entered = () => ({ l: Number(fields.l.value), w: Number(fields.w.value), d: Number(fields.d.value) });

    function clearResults(message) {
        els.error.textContent = message;
        els.error.hidden = false;
        els.interior.textContent = els.exterior.textContent = '—';
        els.outL.textContent = els.outW.textContent = '—';
        els.hTable.replaceChildren(); els.vTable.replaceChildren(); els.svg.replaceChildren();
    }

    function showResults(interior, exterior, thickness) {
        els.error.hidden = true;
        els.mm.textContent = `≈ ${(thickness * model.MM_PER_INCH).toFixed(2)} mm`;
        els.interior.textContent = triplet(interior);
        els.exterior.textContent = triplet(exterior);
        const blank = model.blankFromInterior(interior);
        els.outL.textContent = display(blank.overL);
        els.outW.textContent = display(blank.overW);
        els.hTable.innerHTML = blank.hSegments.map(s => `<tr class="hover:bg-slate-800/50 transition-colors"><td class="px-4 py-2 font-medium text-slate-300">${s.name}</td><td class="px-4 py-2 text-right rsc-mark rsc-mark-purple">${display(s.markAt)}</td><td class="px-4 py-2 text-right rsc-size">${display(s.size)}</td></tr>`).join('');
        els.vTable.innerHTML = blank.vSegments.map(s => `<tr class="hover:bg-slate-800/50 transition-colors"><td class="px-4 py-2 font-medium text-slate-300">${s.name}</td><td class="px-4 py-2 text-right rsc-mark rsc-mark-emerald">${display(s.markAt)}</td><td class="px-4 py-2 text-right rsc-size">${display(s.size)}</td></tr>`).join('');
        renderDiagram(interior, blank);
    }

    function update() {
        try {
            for (const key of ['l', 'w', 'd']) if (fields[key].value.trim() === '') throw new RangeError('Enter a positive length, width, and depth.');
            if (els.thickness.value.trim() === '') throw new RangeError('Enter a positive board thickness.');
            const basis = entered(), thickness = Number(els.thickness.value);
            const interior = state.mode === 'interior' ? basis : model.exteriorToInterior(basis, thickness);
            const exterior = state.mode === 'interior' ? model.interiorToExterior(interior, thickness) : basis;
            state.exactInterior = interior;
            showResults(interior, exterior, thickness);
        } catch (error) {
            state.exactInterior = null;
            clearResults(error.message);
        }
    }

    function switchMode(next) {
        if (next === state.mode) return;
        if (!state.exactInterior) {
            document.querySelector(`input[name="rsc-basis"][value="${state.mode}"]`).checked = true;
            return;
        }
        const thickness = Number(els.thickness.value);
        const target = next === 'interior' ? state.exactInterior : model.interiorToExterior(state.exactInterior, thickness);
        for (const key of ['l', 'w', 'd']) fields[key].value = fieldValue(target[key]);
        state.mode = next;
        // Retain unrounded canonical interior dimensions across repeated toggles.
        showResults(state.exactInterior, model.interiorToExterior(state.exactInterior, thickness), thickness);
    }

    for (const field of Object.values(fields)) field.addEventListener('input', update);
    for (const radio of document.querySelectorAll('input[name="rsc-basis"]')) radio.addEventListener('change', () => switchMode(radio.value));
    els.thickness.addEventListener('input', () => { els.preset.value = 'custom'; update(); });
    els.preset.addEventListener('change', () => {
        if (els.preset.value !== 'custom') { els.thickness.value = els.preset.value; update(); }
        else els.thickness.focus();
    });

    function renderDiagram({ l: L, w: W, d: D }, blank) {
        // Follow normal proportions, but constrain extreme ratios so labels stay
        // legible. The MARK AT tables retain the exact hand-marking dimensions.
        const mean = (L + W + D) / 3;
        const visual = (value, base, min, max) => Math.max(min, Math.min(max, base * value / mean));
        const glue = 38, widths = [L, W, L, W].map(v => visual(v, 158, 94, 265));
        const flap = visual(W / 2, 138, 88, 165), body = visual(D, 172, 115, 250);
        const x0 = 82, x1 = x0 + glue, xs = [x1];
        for (const width of widths) xs.push(xs.at(-1) + width);
        const end = xs.at(-1), top = 82, bodyTop = top + flap, bodyBottom = bodyTop + body, bottom = bodyBottom + flap;
        const vbW = end + 54, vbH = bottom + 76;
        const cuts = '#f43f5e', scores = '#67e8f9';
        const line = (a, b, c, d, color, dash = '') => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${color}" stroke-width="2.4" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
        const label = (x, y, value, extra = '') => `<text x="${x}" y="${y}" class="rsc-svg-label ${extra}">${value}</text>`;
        let content = `<svg class="rsc-net" viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="rsc-svg-title rsc-svg-desc"><title id="rsc-svg-title">Regular slotted box flat blank</title><desc id="rsc-svg-desc">Four body panels, top and bottom flaps, a two-inch glue tab, cut lines and score folds.</desc><defs><marker id="rsc-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="#a5b4fc" stroke-width="1.2"/></marker></defs>`;
        content += `<path d="M${x0} ${bodyTop}H${x1}V${top}H${end}V${bottom}H${x1}V${bodyBottom}H${x0}Z" fill="#101827" stroke="${cuts}" stroke-width="2.5"/>`;
        content += `<rect x="${x0}" y="${bodyTop}" width="${glue}" height="${body}" fill="#8b5cf6" fill-opacity=".32"/>`;
        content += label(x0 + glue / 2, bodyTop + body / 2, 'GLUE TAB', 'rsc-svg-glue');
        for (let i = 0; i < 4; i++) {
            const x = xs[i], width = widths[i], center = x + width / 2;
            content += `<rect x="${x}" y="${top}" width="${width}" height="${flap}" fill="${i % 2 ? '#064e3b' : '#4c1d95'}" fill-opacity=".32"/>`;
            content += `<rect x="${x}" y="${bodyTop}" width="${width}" height="${body}" fill="${i % 2 ? '#063c36' : '#35205b'}" fill-opacity=".52"/>`;
            content += `<rect x="${x}" y="${bodyBottom}" width="${width}" height="${flap}" fill="${i % 2 ? '#064e3b' : '#4c1d95'}" fill-opacity=".32"/>`;
            content += label(center, top + flap / 2, 'Top Flap', 'rsc-svg-flap');
            content += label(center, bodyTop + body / 2 - 9, `${i % 2 ? 'Width' : 'Length'} panel`, 'rsc-svg-panel');
            content += label(center, bodyTop + body / 2 + 17, display(i % 2 ? W : L), 'rsc-svg-measure');
            content += label(center, bodyBottom + flap / 2, 'Bottom Flap', 'rsc-svg-flap');
        }
        content += line(x1, bodyTop, end, bodyTop, scores, '7 5') + line(x1, bodyBottom, end, bodyBottom, scores, '7 5');
        for (const x of xs.slice(0, -1)) {
            content += line(x, bodyTop, x, bodyBottom, scores, '7 5');
            if (x > x1) content += line(x, top, x, bodyTop, cuts) + line(x, bodyBottom, x, bottom, cuts);
        }
        content += line(x0, bodyTop, x1, bodyTop, cuts) + line(x0, bodyBottom, x1, bodyBottom, cuts);
        content += `<line x1="${x0}" y1="39" x2="${end}" y2="39" stroke="#a5b4fc" marker-start="url(#rsc-arrow)" marker-end="url(#rsc-arrow)"/>`;
        content += label((x0 + end) / 2, 23, `Blank length ${display(blank.overL)}`, 'rsc-svg-annotation');
        content += `<line x1="39" y1="${top}" x2="39" y2="${bottom}" stroke="#a5b4fc" marker-start="url(#rsc-arrow)" marker-end="url(#rsc-arrow)"/>`;
        content += `<text x="22" y="${(top + bottom) / 2}" transform="rotate(-90 22 ${(top + bottom) / 2})" class="rsc-svg-label rsc-svg-annotation">Blank width ${display(blank.overW)}</text>`;
        content += label((x1 + end) / 2, bottom + 35, `Body depth ${display(D)} · flaps ${display(W / 2)} each`, 'rsc-svg-annotation');
        content += '</svg>';
        els.svg.innerHTML = content;
    }

    update();
})();
