// ── Hamburger ─────────────────────────────────
const hamburger = document.getElementById("hamburger");
const navLinks  = document.getElementById("nav-links");
if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => {
        hamburger.classList.toggle("active");
        navLinks.classList.toggle("active");
    });
}

// Products: expand submenu on mobile instead of navigating away
const productsTrigger = document.getElementById("products-trigger");
const productsItem = productsTrigger ? productsTrigger.closest(".nav-item-expandable") : null;
if (productsTrigger && productsItem) {
    productsTrigger.addEventListener("click", (e) => {
        if (window.innerWidth <= 900) {
            e.preventDefault();
            productsItem.classList.toggle("open");
        }
    });
}

// ── Load script helper ────────────────────────
function loadScript(src, cb) {
    // Don't load if already present
    if (document.querySelector('script[src="' + src + '"]')) {
        if (cb) cb();
        return;
    }
    const s = document.createElement("script");
    s.src = src;
    if (cb) s.onload = cb;
    document.body.appendChild(s);
}

// ── Load cart-drawer after cart ───────────────
function initCart() {
    loadScript("/javascript/cart-drawer.js", () => {
        // Update badge now that Cart is loaded
        const badge = document.getElementById("cart-count");
        if (badge && typeof Cart !== "undefined") {
            const n = Cart.count();
            badge.textContent = n;
            badge.style.display = n > 0 ? "flex" : "none";
        }
    });

    // Wire buttons lazily — CartDrawer will exist by the time user clicks
    const cartBtn = document.getElementById("nav-cart-btn");
    if (cartBtn) {
        cartBtn.addEventListener("click", () => {
            if (window.CartDrawer) window.CartDrawer.open();
        });
    }
    const overlay = document.getElementById("cart-drawer-overlay");
    if (overlay) {
        overlay.addEventListener("click", () => {
            if (window.CartDrawer) window.CartDrawer.close();
        });
    }
}

if (typeof Cart === "undefined") {
    loadScript("/javascript/cart.js", initCart);
} else {
    initCart();
}

// ── Auth state ────────────────────────────────
(async () => {
    try {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        const supabase = createClient(
            "https://zewoxdagbywjubofwvde.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpld294ZGFnYnl3anVib2Z3dmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MjcwNzQsImV4cCI6MjA5NjQwMzA3NH0.EO-I8ghrhP7OhYFOTWmrfNGh6kR98yypC37Yc6eA64E"
        );
        const { data: { user } } = await supabase.auth.getUser();
        const loginLink   = document.getElementById("nav-login");
        const accountLink = document.getElementById("nav-account");
        if (user) {
            if (loginLink)   loginLink.style.display = "none";
            if (accountLink) accountLink.style.display = "flex";
        } else {
            if (loginLink)   loginLink.style.display = "flex";
            if (accountLink) accountLink.style.display = "none";
        }
    } catch(e) { /* non-blocking */ }
})();


// ── Search ──────────────────────────────────────
function loadScript(src, cb) {
    if (document.querySelector('script[src="' + src + '"]')) {
        if (cb) cb();
        return;
    }
    const s = document.createElement("script");
    s.src = src;
    if (cb) s.onload = cb;
    document.body.appendChild(s);
}

const searchBtn = document.getElementById("nav-search-btn");
const searchOverlay = document.getElementById("search-overlay");

if (searchBtn && searchOverlay) {
    loadScript("/javascript/search-index.js", function () {
        const input = document.getElementById("search-input");
        const resultsEl = document.getElementById("search-results");
        const emptyEl = document.getElementById("search-empty");
        const closeBtn = document.getElementById("search-close");

        function open() {
            searchOverlay.classList.add("is-open");
            document.body.style.overflow = "hidden";
            setTimeout(function () { input.focus(); }, 150);
        }
        function close() {
            searchOverlay.classList.remove("is-open");
            document.body.style.overflow = "";
            input.value = "";
            render([]);
        }
        function render(items) {
            if (items.length === 0) {
                resultsEl.innerHTML = "";
                emptyEl.style.display = input.value.trim() ? "block" : "none";
                return;
            }
            emptyEl.style.display = "none";
            resultsEl.innerHTML = items.map(function (item) {
                return '<a class="search-result" href="' + item.url + '">' +
                    '<img src="' + item.image + '" alt=""/>' +
                    '<div class="search-result-text">' +
                    '<span class="search-result-name">' + item.name + '</span>' +
                    '<span class="search-result-desc">' + item.desc + '</span>' +
                    '</div></a>';
            }).join("");
        }
        function doSearch(query) {
            const q = query.trim().toLowerCase();
            if (!q) { render([]); return; }
            const index = window.RITUAL_SEARCH_INDEX || [];
            render(index.filter(function (item) {
                return (item.name + " " + item.desc + " " + item.tags).toLowerCase().indexOf(q) !== -1;
            }));
        }

        searchBtn.addEventListener("click", open);
        closeBtn.addEventListener("click", close);
        searchOverlay.addEventListener("click", function (e) { if (e.target === searchOverlay) close(); });
        input.addEventListener("input", function () { doSearch(input.value); });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && searchOverlay.classList.contains("is-open")) close();
            if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); open(); }
        });
    });
}