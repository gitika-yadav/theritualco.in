/* ════════════════════════════════════════════════════════════════
   THE RITUAL CO. — Automatic Availability
   Drives "In stock" / "Out of stock" state from the live Supabase
   `inventory` table via /.netlify/functions/get-availability.

   Sold out when  sold >= total_stock.
   Back in stock automatically when total_stock is raised in the DB.

   Used on:
     - individual product pages (windows.PRODUCT_SLUG set, #preorder-btn)
     - the products listing page  (.product-card with data-product-id)
   ════════════════════════════════════════════════════════════════ */
(function () {
    "use strict";

    // Map a page's PRODUCT_SLUG -> inventory product_id(s).
    // weight "1kg"/"2kg" resolves capsule variants; "" means single-id.
    var SLUG_MAP = {
        "capsule-dumbbell": { ids: ["capsule-1kg", "capsule-2kg"], weightAware: true },
        "yoga-belt":        { ids: ["yoga-belt"], weightAware: false },
        "the-ritual-belt":  { ids: ["yoga-belt"], weightAware: false },
        "yoga-block":       { ids: ["yoga-block"], weightAware: false },
        "the-ritual-block": { ids: ["yoga-block"], weightAware: false },
        "yoga-mat":         { ids: ["yoga-mat-5mm"], weightAware: false },
        "the-ritual-mat":   { ids: ["yoga-mat-5mm"], weightAware: false },
        "ankle-weights":    { ids: ["ankle-weights-2lb"], weightAware: false },
        "the-ritual-cuffs": { ids: ["ankle-weights-2lb"], weightAware: false },
        "pilates-ball":     { ids: ["pilates-ball"], weightAware: false },
        "the-ritual-ball":  { ids: ["pilates-ball"], weightAware: false }
    };

    var CACHE_KEY = "ritual_availability_cache";
    var CACHE_TTL_MS = 60 * 1000; // 60s - restocks reflect quickly

    function readCache() {
        try {
            var raw = sessionStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
            return parsed.data;
        } catch (e) { return null; }
    }

    function writeCache(data) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, savedAt: Date.now() }));
        } catch (e) { /* cache is optional */ }
    }

    function norm(key) {
        return String(key || "").toLowerCase().trim().replace(/\s+/g, "");
    }

    function loadAvailability() {
        return new Promise(function (resolve) {
            var cached = readCache();
            if (cached) return resolve(cached);

            fetch("/.netlify/functions/get-availability", {
                headers: { Accept: "application/json" }
            })
                .then(function (r) { if (!r.ok) throw new Error("bad status " + r.status); return r.json(); })
                .then(function (data) {
                    writeCache(data);
                    resolve(data || {});
                })
                .catch(function (err) {
                    console.error("[availability] fetch failed, page keeps its defaults:", err);
                    resolve(null); // null = unknown -> leave HTML as-is
                });
        });
    }

    /* ── Product page: toggle buy button by selected colour/weight ── */
    function initProductPage(availability) {
        var slug = window.PRODUCT_SLUG;
        var map = SLUG_MAP[slug];
        var preorder = document.getElementById("preorder-btn");
        var sticky = document.getElementById("sticky-cart-btn");
        if (!map || !preorder) return;

        function currentOutOfStock() {
            if (!availability) return null; // unknown - don't change markup

            var productId;
            if (map.weightAware) {
                var w = document.querySelector(".weight-option.selected");
                var wkey = (w && (w.dataset.weight || "").toLowerCase()) || "1kg";
                productId = wkey.indexOf("2") === 0 ? map.ids[1] : map.ids[0];
            } else {
                productId = map.ids[0];
            }

            var rec = availability[productId];
            if (!rec) return false; // product not in inventory -> available (legacy)

            // Determine selected colour; absence of a full colour row defaults
            // to the product-level status.
            var colEl = document.querySelector(".color-option.selected, .swatch.is-selected.active, .swatch.is-selected");
            var color = colEl ? norm(colEl.dataset.color) : "";
            var colorRec = color && rec.colors ? rec.colors[color] : null;
            if (colorRec) return !colorRec.in_stock;
            return !rec.in_stock;
        }

        function apply() {
            var soldOut = currentOutOfStock();
            if (soldOut === null) return;

            if (soldOut) {
                preorder.disabled = true;
                preorder.textContent = "Out of stock";
                if (sticky) { sticky.disabled = true; sticky.textContent = "Out of stock"; }
            } else {
                preorder.disabled = false;
                preorder.textContent = "Add to Cart";
                if (sticky) { sticky.disabled = false; sticky.textContent = "Add to Cart"; }
            }
        }

        apply();

        // Re-evaluate whenever a colour or weight option is selected
        function refresh() { setTimeout(apply, 0); }
        document.querySelectorAll(".color-option, .swatch, .weight-option").forEach(function (btn) {
            btn.addEventListener("click", refresh);
        });
    }

    /* ── Products listing: flip cards to match live stock ── */
    function initListing(availability) {
        if (!availability) return;
        var cards = document.querySelectorAll(".product-card[data-product-id]");
        cards.forEach(function (card) {
            var ids = (card.dataset.productId || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
            if (!ids.length) return;

            var hasRec = false, anyInStock = false;
            ids.forEach(function (pid) {
                var rec = availability[pid];
                if (!rec) return;
                hasRec = true;
                if (rec.colors) {
                    Object.keys(rec.colors).forEach(function (c) {
                        if (rec.colors[c].in_stock) anyInStock = true;
                    });
                } else if (rec.in_stock) {
                    anyInStock = true;
                }
            });
            if (!hasRec) return; // no inventory row yet - keep authored state

            var badge = card.querySelector(".product-card__badge");
            var cta = card.querySelector(".product-card__btn, .product-card__btn-outline");

            if (anyInStock) {
                card.setAttribute("data-status", "live");
                if (badge) {
                    badge.textContent = "Available Now";
                    badge.classList.remove("badge-soon");
                    badge.classList.add("badge-live");
                }
                if (cta) cta.textContent = "View Product";
            } else {
                card.setAttribute("data-status", "soon");
                if (badge) {
                    badge.textContent = "Sold Out";
                    badge.classList.remove("badge-live", "badge-soon");
                    badge.classList.add("badge-soon");
                }
                if (cta) cta.textContent = "Sold Out";
            }
            // Reflect status into the filter UI immediately
            if (window.applyFilters) applyFilters();
        });
    }

    loadAvailability().then(function (avail) {
        initProductPage(avail);
        initListing(avail);
    });
})();
