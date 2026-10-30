// javascript/meta-pixel.js
// Meta Pixel for every public page. Include once in <head>, AFTER any inline
// Pixel snippet the page may still have:
//   <script src="/javascript/meta-pixel.js"></script>
//
// - Loads the Pixel + PageView only if the page hasn't already (no double PageView)
// - Fires ViewContent on product pages, read from the page's Product JSON-LD
// - Exposes window.trackMeta(event, params, eventId) — a no-op-safe wrapper
//   (AddToCart is fired from Cart.add() in cart.js; Purchase from thank-you.html)

// ── Staff mode ──────────────────────────────────────────────────────
// Open any page with ?staff=on once per browser/device and that browser stops
// sending anything to Meta (no PageView/AddToCart/Purchase) and stops sending
// GA ecommerce events (add_to_cart, checkout, purchase…). Test orders then
// don't show up in ad results. ?staff=off turns it back off.
(function () {
    try {
        var m = /[?&]staff=(on|off)\b/.exec(location.search);
        if (m) {
            document.cookie = m[1] === "on"
                ? "trc_staff=1; path=/; max-age=63072000; SameSite=Lax"
                : "trc_staff=; path=/; max-age=0; SameSite=Lax";
        }
    } catch (e) {}
    window.TRC_STAFF = /(^|;)\s*trc_staff=1/.test(document.cookie);
    if (!window.TRC_STAFF) return;

    // Meta: swallow everything.
    window.fbq = window.fbq && window.fbq.callMethod ? window.fbq : function () {};
    window.trackMeta = function () {};

    // GA: drop ecommerce / conversion events, keep plain page views.
    var BLOCK = ["purchase", "view_item", "view_item_list", "add_to_cart", "remove_from_cart", "begin_checkout", "view_cart",
        "add_payment_info", "select_promotion", "sign_up", "cart_restored", "generate_lead"];
    function wrap() {
        if (typeof window.gtag !== "function" || window.gtag.__staff) return;
        var orig = window.gtag;
        window.gtag = function (cmd, name) {
            if (cmd === "event" && BLOCK.indexOf(name) !== -1) return;
            return orig.apply(this, arguments);
        };
        window.gtag.__staff = true;
    }
    wrap();
    document.addEventListener("DOMContentLoaded", wrap);

    // A small badge so you always know you're in staff mode.
    document.addEventListener("DOMContentLoaded", function () {
        var b = document.createElement("a");
        b.href = "?staff=off";
        b.title = "Your visits and test orders aren't tracked. Click to turn off.";
        b.textContent = "Staff mode · not tracked";
        b.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:99999;background:#1a1714;color:#faf9f6;font:500 11px/1 -apple-system,sans-serif;letter-spacing:.04em;padding:8px 12px;border-radius:999px;text-decoration:none;opacity:.85;";
        document.body.appendChild(b);
    });
})();

(function () {
    if (window.TRC_STAFF) return; // staff mode: no Meta Pixel at all
    var PIXEL_ID = '1372190218138137';

    if (!window.fbq) {
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', PIXEL_ID);
        fbq('track', 'PageView');
    }

    // Product ids sent to Meta must match item_group_id in the catalog feed
    // (/meta-catalog.csv). A few pages use a different id for the same product.
    var CATALOG_ID_ALIASES = {
        'ankle-weights': 'ankle-weights-2lb',
        'yoga-mat': 'yoga-mat-5mm',
        'capsule-dumbbell-1kg': 'capsule-dumbbell',
        'capsule-dumbbell-2kg': 'capsule-dumbbell'
    };

    window.trackMeta = function (event, params, eventId) {
        try {
            if (typeof window.fbq !== 'function') return;
            if (params && Array.isArray(params.content_ids)) {
                params.content_ids = params.content_ids.map(function (id) {
                    return CATALOG_ID_ALIASES[id] || id;
                });
                params.content_type = 'product_group';
            }
            if (eventId) fbq('track', event, params || {}, { eventID: String(eventId) });
            else fbq('track', event, params || {});
        } catch (e) { /* tracking must never break the page */ }
    };

    // ── ViewContent on product pages ──
    function findProductSchema() {
        var blocks = document.querySelectorAll('script[type="application/ld+json"]');
        for (var i = 0; i < blocks.length; i++) {
            try {
                var data = JSON.parse(blocks[i].textContent);
                var list = Array.isArray(data) ? data : [data];
                for (var j = 0; j < list.length; j++) {
                    if (list[j] && list[j]['@type'] === 'Product') return list[j];
                }
            } catch (e) { /* malformed block — skip */ }
        }
        return null;
    }

    function fireViewContent() {
        var product = findProductSchema();
        if (!product) return;
        var offers = product.offers;
        var offer = Array.isArray(offers) ? offers[0] : offers;
        var price = offer && offer.price ? parseFloat(offer.price) : undefined;
        var id = window.PRODUCT_SLUG || (offer && offer.sku) || product.sku || product.name;
        window.trackMeta('ViewContent', {
            content_ids: [id],
            content_name: product.name,
            content_type: 'product',
            value: price,
            currency: 'INR'
        });
    }

    // Wait for the full page so window.PRODUCT_SLUG (set at the end of <body>) is available
    if (document.readyState === 'complete') fireViewContent();
    else window.addEventListener('load', fireViewContent);
})();
