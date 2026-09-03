// javascript/cart.js
// Guard against double-loading
if (typeof Cart === "undefined") {

    window.Cart = (() => {
        const KEY = "trc_cart";
        const AVAIL_CACHE_KEY = "ritual_availability_cache";

        function get() {
            try { return JSON.parse(localStorage.getItem(KEY)) || { items: [] }; }
            catch { return { items: [] }; }
        }

        function save(cart) {
            localStorage.setItem(KEY, JSON.stringify(cart));
            window.dispatchEvent(new CustomEvent("cart:updated", { detail: cart }));
        }

        function itemKey(id, weight, color) {
            return `${id}__${weight}__${color}`;
        }

        function norm(key) {
            return String(key || "").toLowerCase().trim().replace(/\s+/g, "");
        }

        // Map cart product ID to inventory product ID (mirrors shared/product-map.js)
        function resolveInventoryId(id, weight) {
            if (id === "capsule-dumbbell") {
                const w = (weight || "").toLowerCase();
                return w.indexOf("2") === 0 ? "capsule-2kg" : "capsule-1kg";
            }
            return id;
        }

        // Read cached availability from sessionStorage (written by product-availability.js)
        function getCachedAvailability() {
            try {
                const raw = sessionStorage.getItem(AVAIL_CACHE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (Date.now() - parsed.savedAt > 60 * 1000) return null;
                return parsed.data || null;
            } catch { return null; }
        }

        // TOTAL stock available for an item (ignores cart). Infinity = unknown/no row.
        function getAvailable(id, weight, color) {
            const avail = getCachedAvailability();
            if (!avail) return Infinity;

            const invId = resolveInventoryId(id, weight);
            const rec = avail[invId];
            if (!rec) return Infinity;

            const colorKey = norm(color);
            const colorRec = colorKey && rec.colors ? rec.colors[colorKey] : null;
            if (colorRec) return Number(colorRec.stock) || 0;
            return rec.in_stock ? Infinity : 0;
        }

        // Quantity of this exact item already in the cart
        function getInCartQty(id, weight, color) {
            const cart = get();
            const key = itemKey(id, weight, color);
            const inCart = cart.items.find(i => i.key === key);
            return inCart ? inCart.qty : 0;
        }

        // Remaining units still addable = total stock - cart qty
        function getRemaining(id, weight, color) {
            const available = getAvailable(id, weight, color);
            return Math.max(0, available - getInCartQty(id, weight, color));
        }

        // Simple toast helper
        function toast(msg) {
            let el = document.getElementById("trc-stock-toast");
            if (!el) {
                el = document.createElement("div");
                el.id = "trc-stock-toast";
                el.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1814;color:#faf9f6;padding:12px 20px;border-radius:8px;font-size:13px;z-index:10000;opacity:0;transition:opacity .25s;pointer-events:none;font-family:inherit;";
                document.body.appendChild(el);
            }
            el.textContent = msg;
            el.classList.add("show");
            clearTimeout(el._timer);
            el._timer = setTimeout(() => el.classList.remove("show"), 3000);
        }

        function add({ id, name, weight, color, price, image }) {
            // Block if cart already holds the max available stock
            if (getRemaining(id, weight, color) <= 0) {
                toast("Already at max in stock for this item");
                return get();
            }

            const cart = get();
            const key  = itemKey(id, weight, color);
            const existing = cart.items.find(i => i.key === key);
            if (existing) {
                existing.qty += 1;
            } else {
                cart.items.push({ key, id, name, weight, color, price, image, qty: 1 });
            }
            save(cart);
            return cart;
        }

        function remove(key) {
            const cart = get();
            cart.items = cart.items.filter(i => i.key !== key);
            save(cart);
        }

        function updateQty(key, qty) {
            const cart = get();
            const item = cart.items.find(i => i.key === key);
            if (!item) return;
            if (qty < 1) { remove(key); return; }

            // Cap at total stock available for this item
            const available = getAvailable(item.id, item.weight, item.color);
            const capped = Number.isFinite(available) ? Math.min(qty, available) : qty;
            if (capped < qty) toast("Only " + available + " available");

            item.qty = capped;
            save(cart);
        }

        function clear() { save({ items: [] }); }

        function count() {
            return get().items.reduce((sum, i) => sum + i.qty, 0);
        }

        function total() {
            return get().items.reduce((sum, i) => sum + i.price * i.qty, 0);
        }

        function updateBadge() {
            const badge = document.getElementById("cart-count");
            if (!badge) return;
            const n = count();
            badge.textContent = n;
            badge.style.display = n > 0 ? "flex" : "none";
        }

        window.addEventListener("cart:updated", updateBadge);
        document.addEventListener("DOMContentLoaded", updateBadge);

        return { get, add, remove, updateQty, clear, count, total, itemKey, getAvailable, getInCartQty, getRemaining, toast };
    })();

} // end guard