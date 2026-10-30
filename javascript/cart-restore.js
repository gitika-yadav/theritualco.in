// javascript/cart-restore.js
// "Return to your cart" link from the reminder email:
//   /cart.html?restore=<token>
// Loads the saved cart (works on any device), puts it back in the cart, and
// keeps the same token so the session is marked done when they order.

(function () {
    var params = new URLSearchParams(location.search);
    var token = params.get("restore");
    if (!token || typeof Cart === "undefined") return;

    function cleanUrl() {
        params.delete("restore");
        var q = params.toString();
        history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash);
    }

    fetch("/.netlify/functions/save-checkout?token=" + encodeURIComponent(token), { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            cleanUrl();
            if (!data || !data.items || !data.items.length) return;
            var current = Cart.get();
            var byKey = {};
            (current.items || []).forEach(function (i) { byKey[i.key] = i; });
            data.items.forEach(function (i) {
                var key = i.key || Cart.itemKey(i.id, i.weight, i.color);
                if (!byKey[key]) {
                    byKey[key] = { key: key, id: i.id, name: i.name, weight: i.weight, color: i.color, price: i.price, image: i.image, sku: i.sku, qty: i.qty };
                }
            });
            var merged = { items: Object.keys(byKey).map(function (k) { return byKey[k]; }) };
            localStorage.setItem("trc_cart", JSON.stringify(merged));
            try { localStorage.setItem("trc_checkout_token", token); } catch (e) {}
            window.dispatchEvent(new CustomEvent("cart:updated", { detail: merged }));
            try { if (typeof gtag === "function") gtag("event", "cart_restored", { source: "reminder_email" }); } catch (e) {}
        })
        .catch(cleanUrl);
})();
