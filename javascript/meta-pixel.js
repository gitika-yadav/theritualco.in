// javascript/meta-pixel.js
// Meta Pixel for every public page. Include once in <head>, AFTER any inline
// Pixel snippet the page may still have:
//   <script src="/javascript/meta-pixel.js"></script>
//
// - Loads the Pixel + PageView only if the page hasn't already (no double PageView)
// - Fires ViewContent on product pages, read from the page's Product JSON-LD
// - Exposes window.trackMeta(event, params, eventId) — a no-op-safe wrapper
//   (AddToCart is fired from Cart.add() in cart.js; Purchase from thank-you.html)

(function () {
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
