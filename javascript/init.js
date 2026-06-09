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

    // Load footer partial
    fetch("/partials/footer.html")
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var el = document.getElementById("footer-placeholder");
            if (el) el.innerHTML = html;
        });
})();