// javascript/cart.js
// Guard against double-loading
if (typeof Cart === "undefined") {

    window.Cart = (() => {
        const KEY = "trc_cart";

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

        function add({ id, name, weight, color, price, image }) {
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
            item.qty = qty;
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

        return { get, add, remove, updateQty, clear, count, total, itemKey };
    })();

} // end guard