(() => {
    'use strict';
    const M = FlipModel, $ = id => document.getElementById(id);
    const keys = ['purchase','purchaseTax','parts','otherBuy','sale','feePct','fixedFee','adPct','shipping','insurance','packaging','otherSell'];
    const storageKey = 'zany-flip-values-v1', presetsKey = 'zany-flip-fee-presets-v1';
    const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
    const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing */ } };
    const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
    const percent = n => n === null ? '—' : `${n.toFixed(1)}%`;
    const stored = read(storageKey), presets = Array.isArray(read(presetsKey)) ? read(presetsKey) : [];
    if (stored && typeof stored === 'object') {
        for (const key of keys) if (stored[key] !== undefined) $('flip-' + key).value = stored[key];
        if (stored.target !== undefined) $('flip-target').value = stored.target;
    }
    function values() { return Object.fromEntries(keys.map(key => [key, $('flip-' + key).value])); }
    function persist() { save(storageKey, { ...values(), target: $('flip-target').value }); }
    function showError(message) { $('flip-error').textContent = message; $('flip-error').hidden = false; }
    function clearError() { $('flip-error').hidden = true; }
    function renderPresetOptions() {
        $('flip-fee-preset').querySelectorAll('option[data-saved]').forEach(el => el.remove());
        for (const [index, preset] of presets.entries()) {
            const option = new Option(preset.name, `saved-${index}`); option.dataset.saved = 'true'; $('flip-fee-preset').add(option);
        }
    }
    function calculate() {
        try {
            const raw = values(), result = M.calculate(raw);
            const targetRaw = $('flip-target').value;
            const target = targetRaw.trim() === '' ? 0 : Number(targetRaw);
            const required = M.requiredSale(raw, target);
            clearError();
            $('flip-profit').textContent = money(result.profit);
            $('flip-profit').classList.toggle('loss', result.profit < 0);
            $('flip-profit-note').textContent = result.profit < 0 ? 'This sale would lose money after all costs.' : 'After investment and selling costs';
            $('flip-roi').textContent = percent(result.roi); $('flip-margin').textContent = percent(result.margin);
            $('flip-gross').textContent = money(result.values.sale); $('flip-invested').textContent = money(result.invested);
            $('flip-percent-fees').textContent = money(result.percentageFees); $('flip-fixed-costs').textContent = money(result.fixedSelling);
            $('flip-selling').textContent = money(result.sellingCosts); $('flip-proceeds').textContent = money(result.proceeds);
            $('flip-break-even').textContent = money(M.requiredSale(raw, 0)); $('flip-required').textContent = money(required);
            const offerText = $('flip-offer').value.trim();
            if (!offerText) $('flip-offer-result').textContent = 'Enter an offer to see its profit and ROI.';
            else {
                const offer = M.calculate({ ...raw, sale: offerText });
                $('flip-offer-result').textContent = `At ${money(offer.values.sale)}: ${money(offer.profit)} profit · ${percent(offer.roi)} ROI`;
            }
        } catch (error) {
            showError(error.message);
            for (const id of ['profit','roi','margin','gross','invested','percent-fees','fixed-costs','selling','proceeds','break-even','required']) $('flip-' + id).textContent = '—';
            $('flip-offer-result').textContent = 'Fix the values above to check an offer.';
        }
    }
    for (const key of keys) $('flip-' + key).addEventListener('input', () => {
        if (['feePct','fixedFee','adPct'].includes(key)) $('flip-fee-preset').value = 'custom';
        persist(); calculate();
    });
    $('flip-target').addEventListener('input', () => { persist(); calculate(); });
    $('flip-offer').addEventListener('input', calculate);
    $('flip-fee-preset').addEventListener('change', event => {
        let fee;
        if (event.target.value === 'none') fee = { feePct: 0, fixedFee: 0, adPct: 0 };
        else if (event.target.value.startsWith('saved-')) fee = presets[Number(event.target.value.slice(6))];
        if (fee) { for (const key of ['feePct','fixedFee','adPct']) $('flip-' + key).value = fee[key]; persist(); calculate(); }
    });
    $('flip-save-preset').addEventListener('click', () => {
        const name = $('flip-preset-name').value.trim();
        if (!name) { showError('Give this fee preset a name first.'); return; }
        try {
            const v = M.normalize(values());
            presets.push({ name, feePct: v.feePct, fixedFee: v.fixedFee, adPct: v.adPct });
            save(presetsKey, presets); renderPresetOptions(); $('flip-fee-preset').value = `saved-${presets.length - 1}`;
            $('flip-preset-name').value = ''; clearError();
        } catch (error) { showError(error.message); }
    });
    $('flip-reset').addEventListener('click', () => {
        for (const key of keys) $('flip-' + key).value = '';
        $('flip-target').value = ''; $('flip-offer').value = ''; $('flip-fee-preset').value = 'none';
        persist(); calculate();
    });
    renderPresetOptions(); calculate();
})();
