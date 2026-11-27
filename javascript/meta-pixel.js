// javascript/meta-pixel.js
// Meta Pixel for every public page. Include once in <head>, AFTER any inline
// Pixel snippet the page may still have:
//   <script src="/javascript/meta-pixel.js"></script>
//
// - Loads the Pixel + PageView only if the page hasn't already (no double PageView)
// - Fires ViewContent on product pages, read from the page's Product JSON-LD
// - Exposes window.trackMeta(event, params, eventId) — a no-op-safe wrapper
//   (AddToCart is fired from Cart.add() in cart.js; Purchase from thank-you.html)

// ── Production only ─────────────────────────────────────────────────
// Netlify preview sites (deploy-preview-…, *.netlify.app) and localhost send
// nothing to GA or Meta, so test clicks never mix with real data.
(function () {
    var h = location.hostname;
    if (h === "theritualco.in" || h === "www.theritualco.in") return;
    window["ga-disable-G-D366Q7R3XB"] = true;
    window.TRC_NONPROD = true;
})();

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
    if (window.TRC_STAFF || window.TRC_NONPROD) return; // staff mode or preview site: no Meta Pixel at all
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

    // ── Advanced matching (raises Event Match Quality) ──
    // A first-party visitor id (external_id) for everyone, plus the shopper's
    // email / phone / name / city once we know them (checkout form, login).
    // Only SHA-256 hashes are stored or sent — never the plain values.
    var AM_KEY = 'trc_am';
    function readCookie(n) { return (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1] || ''; }
    function visitorId() {
        var id = readCookie('trc_xid');
        if (!id) {
            var a = new Uint8Array(16);
            (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
            id = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
            document.cookie = 'trc_xid=' + id + '; path=/; max-age=63072000; SameSite=Lax';
        }
        return id;
    }
    window.metaVisitorId = visitorId;
    function sha256(v) {
        var n = String(v == null ? '' : v).trim().toLowerCase();
        if (!n || !(window.crypto && crypto.subtle)) return Promise.resolve('');
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(n)).then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
        });
    }
    function storedAM() { try { return JSON.parse(localStorage.getItem(AM_KEY) || '{}') || {}; } catch (e) { return {}; } }
    function applyAM(am) { try { if (typeof window.fbq === 'function') fbq('init', PIXEL_ID, am); } catch (e) {} }

    // setMetaUser({ email, phone, name, city, state, zip }) — any subset.
    window.setMetaUser = function (u) {
        u = u || {};
        var digits = String(u.phone || '').replace(/\D/g, '');
        if (digits.length === 10) digits = '91' + digits;
        var parts = String(u.name || '').trim().split(/\s+/);
        var raw = {
            em: u.email, ph: digits,
            fn: parts[0], ln: parts.slice(1).join(' '),
            ct: String(u.city || '').replace(/\s+/g, ''), st: String(u.state || '').replace(/\s+/g, ''),
            zp: u.zip
        };
        var keys = Object.keys(raw);
        return Promise.all(keys.map(function (k) { return sha256(raw[k]); })).then(function (h) {
            var am = storedAM();
            keys.forEach(function (k, i) { if (h[i]) am[k] = h[i]; });
            try { localStorage.setItem(AM_KEY, JSON.stringify(am)); } catch (e) {}
            return window.metaUserData().then(applyAM);
        }).catch(function () {});
    };
    // Hashed user data for the Pixel and our server events.
    window.metaUserData = function () {
        var am = storedAM();
        return Promise.all([sha256(visitorId()), sha256('in')]).then(function (h) {
            if (h[0]) am.external_id = h[0];
            if (h[1]) am.country = h[1];
            return am;
        });
    };
    window.metaUserData().then(applyAM).catch(function () {});

    // Add to cart and Initiate checkout also go to our server (Conversions API)
    // with the same event id, so Meta counts each once and can match it even
    // when the browser Pixel is blocked.
    var SERVER_EVENTS = { AddToCart: 1, InitiateCheckout: 1 };
    function sendServerEvent(event, params, eventId) {
        window.metaUserData().then(function (am) {
            var payload = JSON.stringify({
                event: event, event_id: eventId, params: params || {}, user: am,
                fbp: readCookie('_fbp'), fbc: readCookie('_fbc'),
                source_url: location.origin + location.pathname
            });
            var url = '/.netlify/functions/meta-event';
            try {
                if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))) return;
            } catch (e) {}
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
        }).catch(function () {});
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
            if (!eventId && SERVER_EVENTS[event]) eventId = event + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            if (eventId) fbq('track', event, params || {}, { eventID: String(eventId) });
            else fbq('track', event, params || {});
            if (SERVER_EVENTS[event]) sendServerEvent(event, params, String(eventId));
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
