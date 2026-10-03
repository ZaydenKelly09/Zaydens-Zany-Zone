/* Pure RSC geometry and the original simplified blank formulas. All values are inches. */
(function (root, factory) {
    const model = factory();
    if (typeof module === 'object' && module.exports) module.exports = model;
    else root.RSCModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const GLUE_TAB = 2;
    const MM_PER_INCH = 25.4;

    function validateDimensions(dimensions, thickness) {
        for (const key of ['l', 'w', 'd']) {
            if (!Number.isFinite(dimensions[key]) || dimensions[key] <= 0) {
                throw new RangeError(`${{ l: 'Length', w: 'Width', d: 'Depth' }[key]} must be greater than zero.`);
            }
        }
        if (!Number.isFinite(thickness) || thickness <= 0) throw new RangeError('Board thickness must be greater than zero.');
    }

    // A closed RSC has one board thickness at each opposing side wall (L/W),
    // and two overlapping flap layers at EACH end (D). This gives a conservative
    // usable inside depth across the inner flaps. Real scores, crushed folds and
    // closure methods require a maker-specific allowance, so these are estimates.
    function offsets(thickness) { return { l: 2 * thickness, w: 2 * thickness, d: 4 * thickness }; }
    function interiorToExterior(interior, thickness) {
        validateDimensions(interior, thickness);
        const o = offsets(thickness);
        return { l: interior.l + o.l, w: interior.w + o.w, d: interior.d + o.d };
    }
    function exteriorToInterior(exterior, thickness) {
        validateDimensions(exterior, thickness);
        const o = offsets(thickness);
        const interior = { l: exterior.l - o.l, w: exterior.w - o.w, d: exterior.d - o.d };
        for (const key of ['l', 'w', 'd']) {
            if (interior[key] <= 0) throw new RangeError(`Exterior ${{ l: 'length', w: 'width', d: 'depth' }[key]} must exceed ${o[key].toFixed(3)}″ at this board thickness.`);
        }
        return interior;
    }

    // The legacy simplified blank uses INSIDE L/W/D as score-to-score panel
    // lengths. Do not feed exterior dimensions here. Manufacturer score/bend
    // allowances are deliberately outside the scope of this hand-marking guide.
    function blankFromInterior({ l: L, w: W, d: D }) {
        const hSegments = [
            { name: 'Glue Tab', size: GLUE_TAB },
            { name: 'Panel 1 (Length)', size: L },
            { name: 'Panel 2 (Width)', size: W },
            { name: 'Panel 3 (Length)', size: L },
            { name: 'Panel 4 (Width)', size: W }
        ];
        const vSegments = [
            { name: 'Top Flap', size: W / 2 },
            { name: 'Box Depth', size: D },
            { name: 'Bottom Flap', size: W / 2 }
        ];
        let h = 0, v = 0;
        return {
            overL: (2 * L) + (2 * W) + GLUE_TAB,
            overW: D + W,
            hSegments: hSegments.map(s => ({ ...s, markAt: h += s.size })),
            vSegments: vSegments.map(s => ({ ...s, markAt: v += s.size }))
        };
    }
    return { GLUE_TAB, MM_PER_INCH, validateDimensions, interiorToExterior, exteriorToInterior, blankFromInterior };
});
