(function (root, factory) {
    const model = factory();
    if (typeof module === 'object' && module.exports) module.exports = model;
    else root.FlipModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const costs = ['purchase', 'purchaseTax', 'parts', 'otherBuy', 'sale', 'feePct', 'fixedFee', 'adPct', 'shipping', 'insurance', 'packaging', 'otherSell'];
    function normalize(values) {
        const result = {};
        for (const key of costs) {
            const raw = values[key];
            const n = raw === '' || raw === null || raw === undefined ? 0 : Number(raw);
            if (!Number.isFinite(n) || n < 0) throw new RangeError(`${key} must be zero or greater.`);
            result[key] = n;
        }
        if (result.feePct >= 100 || result.adPct >= 100 || result.feePct + result.adPct >= 100) {
            throw new RangeError('Combined marketplace and promoted-listing fees must be below 100%.');
        }
        return result;
    }
    function calculate(values) {
        const v = normalize(values);
        const invested = v.purchase + v.purchaseTax + v.parts + v.otherBuy;
        const percentageFees = v.sale * (v.feePct + v.adPct) / 100;
        const fixedSelling = v.fixedFee + v.shipping + v.insurance + v.packaging + v.otherSell;
        const sellingCosts = percentageFees + fixedSelling;
        const proceeds = v.sale - sellingCosts;
        const profit = proceeds - invested;
        const denominator = 1 - (v.feePct + v.adPct) / 100;
        return { values: v, invested, percentageFees, fixedSelling, sellingCosts, proceeds, profit,
            roi: invested > 0 ? profit / invested * 100 : null,
            margin: v.sale > 0 ? profit / v.sale * 100 : null,
            breakEven: (invested + fixedSelling) / denominator };
    }
    // The sale price also changes percentage fees. Solve algebraically, then
    // round UP to the next cent so the displayed price reaches the goal.
    function requiredSale(values, targetProfit = 0) {
        const v = normalize(values);
        const target = Number(targetProfit);
        if (!Number.isFinite(target) || target < 0) throw new RangeError('Target profit must be zero or greater.');
        const invested = v.purchase + v.purchaseTax + v.parts + v.otherBuy;
        const fixed = v.fixedFee + v.shipping + v.insurance + v.packaging + v.otherSell;
        const exact = (invested + fixed + target) / (1 - (v.feePct + v.adPct) / 100);
        return Math.max(0, Math.ceil((exact - 1e-9) * 100) / 100);
    }
    return { normalize, calculate, requiredSale };
});
