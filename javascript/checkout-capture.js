// javascript/checkout-capture.js
// On the checkout page: once the shopper has typed a valid email, save their
// cart so we can send ONE reminder if they leave without ordering
// (netlify/functions/save-checkout.js → send-cart-reminders.js).
// When the order goes through, the cart is cleared and the session is marked done.

(function () {
    var KEY = "trc_checkout_token";
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var timer = null;
    var lastSent = "";

    function token() {
        var t = null;
        try { t = localStorage.getItem(KEY); } catch (e) {}
        if (!t) {
            t = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
                : (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
            try { localStorage.setItem(KEY, t); } catch (e) {}
        }
        return t;
    }

    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value.trim() : "";
    }

    function save() {
        if (typeof Cart === "undefined") return;
        var email = val("email");
        var items = Cart.get().items || [];
        if (!EMAIL_RE.test(email) || !items.length) return;
        var payload = { token: token(), email: email, name: val("name"), phone: val("phone"), items: items };
        var sig = JSON.stringify(payload);
        if (sig === lastSent) return;
        lastSent = sig;
        fetch("/.netlify/functions/save-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: sig,
            keepalive: true
        }).catch(function () {});
    }

    function later() { clearTimeout(timer); timer = setTimeout(save, 800); }

    ["email", "name", "phone"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("change", later);
        el.addEventListener("blur", later);
    });

    // Order placed → checkout.html clears the cart. Mark this session done.
    window.addEventListener("cart:updated", function (e) {
        var cart = (e && e.detail) || (typeof Cart !== "undefined" ? Cart.get() : null);
        if (cart && cart.items && !cart.items.length) {
            var t = null;
            try { t = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch (err) {}
            if (t) {
                fetch("/.netlify/functions/save-checkout", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: t, converted: true }),
                    keepalive: true
                }).catch(function () {});
            }
        } else {
            later();
        }
    });

    // Signed-in shoppers have the email filled in already.
    setTimeout(save, 1500);
    window.addEventListener("pagehide", save);
})();
