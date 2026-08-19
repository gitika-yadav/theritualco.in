// javascript/price-sync.js
// Include this on every product page. Fetches current prices once from
// get-prices.js and:
//   1. Fills in any element tagged data-price-product="<id>" with the live price
//   2. Shows/hides + fills any element tagged data-retail-product="<id>" (the
//      strikethrough MRP) only when early-bird is actually active
//   3. Exposes window.getCurrentPrice(productId) for Cart.add()/gtag calls to
//      use instead of a hardcoded number
//
// The hardcoded ₹ number already in your HTML stays as-is — it's just the
// fallback shown for the instant before this script finishes loading, and if
// the fetch ever fails, the page still works with that fallback value.

(function () {
    window.__RITUAL_PRICES__ = null;

    var CACHE_KEY = 'ritual_prices_cache';
    var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — long enough to skip repeat fetches while browsing, short enough that a real price change shows up fast

    function readCache() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null; // expired
            return parsed.prices;
        } catch (e) {
            return null; // sessionStorage unavailable (private browsing etc.) — just skip caching
        }
    }

    function writeCache(prices) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ prices: prices, savedAt: Date.now() }));
        } catch (e) {
            // ignore — caching is an optimization, not a requirement
        }
    }

    async function loadPrices() {
        var cached = readCache();
        if (cached) {
            window.__RITUAL_PRICES__ = cached;
            applyPrices();
            return; // skip the network call entirely — reused from this session's earlier page
        }

        try {
            const res = await fetch('/.netlify/functions/get-prices');
            const data = await res.json();
            window.__RITUAL_PRICES__ = data.prices || {};
            writeCache(window.__RITUAL_PRICES__);
            applyPrices();
        } catch (e) {
            console.error('[price-sync] Failed to load live prices, using page fallback values:', e);
        }
    }

    function formatRupees(paise) {
        return '₹' + Math.round(paise / 100).toLocaleString('en-IN');
    }

    function applyPrices() {
        var prices = window.__RITUAL_PRICES__;
        if (!prices) return;

        document.querySelectorAll('[data-price-product]').forEach(function (el) {
            var p = prices[el.dataset.priceProduct];
            if (!p) return;
            var paise = p.is_early_bird ? p.early_bird_price_paise : p.price_paise;
            el.textContent = formatRupees(paise);
        });

        document.querySelectorAll('[data-retail-product]').forEach(function (el) {
            var p = prices[el.dataset.retailProduct];
            if (!p) return;
            if (p.is_early_bird) {
                el.style.display = '';
                el.textContent = formatRupees(p.price_paise);
            } else {
                el.style.display = 'none';
            }
        });
    }

    window.getCurrentPrice = function (productId) {
        var prices = window.__RITUAL_PRICES__;
        if (!prices || !prices[productId]) return null; // caller should fall back to its own hardcoded value
        var p = prices[productId];
        return Math.round((p.is_early_bird ? p.early_bird_price_paise : p.price_paise) / 100);
    };

    loadPrices();
})();