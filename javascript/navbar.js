// javascript/navbar.js

// ── Hamburger ─────────────────────────────────
const hamburger = document.getElementById("hamburger");
const navLinks  = document.getElementById("nav-links");
if (hamburger && navLinks) {
    hamburger.addEventListener("click", () => navLinks.classList.toggle("active"));
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