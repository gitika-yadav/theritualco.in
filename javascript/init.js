// javascript/init.js
// Include on every page instead of inline fetch blocks
// <script src="/javascript/init.js"></script>

(function() {
    function loadScript(src, cb) {
        if (document.querySelector('script[src="' + src + '"]')) {
            if (cb) cb();
            return;
        }
        var s = document.createElement("script");
        s.src = src;
        if (cb) s.onload = cb;
        document.body.appendChild(s);
    }

    // Load navbar partial
    fetch("/partials/navbar.html")
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var el = document.getElementById("navbar-placeholder");
            if (el) el.innerHTML = html;
            loadScript("/javascript/cart.js", function() {
                loadScript("/javascript/navbar.js");
            });
        });

    // GA4: WhatsApp / phone / email clicks (floating button, wholesale, contact links)
    document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("a[href]");
        if (!a || typeof window.gtag !== "function") return;
        var href = a.getAttribute("href") || "";
        var method = /wa\.me|whatsapp/i.test(href) ? "whatsapp"
                   : /^tel:/i.test(href) ? "phone"
                   : /^mailto:/i.test(href) ? "email" : null;
        if (method) window.gtag("event", "contact_click", { method: method, page_path: location.pathname });
    }, true);

    // Load footer partial
    fetch("/partials/footer.html")
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var el = document.getElementById("footer-placeholder");
            if (el) el.innerHTML = html;
        });
})();