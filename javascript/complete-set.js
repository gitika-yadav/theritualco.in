// javascript/complete-set.js
// "Complete your set" — on every product page, suggests 3 pieces that pair with
// the product being viewed, shown in the SAME colour the shopper has picked
// (Strawberry Milk mat → Strawberry Milk cuffs, ball, socks).
//
// Mount: <section class="complete-set" id="complete-set" data-product="<id>"></section>
// Stock: hides sold-out pieces via /.netlify/functions/get-availability; if the
// matching colour is sold out, falls back to another in-stock colour.
// Add: uses Cart.add (fires GA add_to_cart + Meta AddToCart) and opens the drawer.

(function () {
    var mount = document.getElementById('complete-set');
    if (!mount) return;
    var current = mount.dataset.product;

    var SHADE = { Cream: 'Vanilla Cream', Pink: 'Strawberry Milk', Black: 'Onyx Black', Coffee: 'Oat Latte' };

    // Pieces that can be suggested. Images are each page's colour photos.
    var CATALOG = {
        'yoga-mat-5mm': {
            name: 'The Ritual Mat', weight: '5mm', price: 4999, url: '/products/the-ritual-mat',
            note: 'Natural rubber, 5mm',
            img: { Cream: '/images/yoga-mat-lifestyle-1.webp', Pink: '/images/yoga-mat-pink-lifestyle.webp', Black: '/images/yoga-mat-black-lifestyle.webp', Coffee: '/images/yoga-mat-lifestyle-2.webp' }
        },
        'ankle-weights-2lb': {
            name: 'The Ritual Cuffs', weight: '2lb', price: 3499, url: '/products/the-ritual-cuffs',
            note: 'Ankle & wrist weights, pair',
            img: { Cream: '/images/cuffs-cream-ankles-ball.webp', Pink: '/images/cuffs-pink-wrists-back.webp', Black: '/images/cuffs-black-wrists.webp', Coffee: '/images/cuffs-coffee-wrists.webp' }
        },
        'pilates-ball': {
            name: 'The Ritual Ball', price: 999, url: '/products/the-ritual-ball',
            note: 'Soft Pilates ball',
            img: { Cream: '/images/pilates-ball-cream.webp', Pink: '/images/pilates-ball-pink.webp', Black: '/images/pilates-ball-black.webp', Coffee: '/images/pilates-ball-coffee.webp' }
        },
        'grip-socks': {
            name: 'The Ritual Grip Socks', price: 699, url: '/products/the-ritual-socks',
            note: 'Grip socks, one pair',
            img: { Cream: '/images/grip-socks-cream-1.webp', Pink: '/images/grip-socks-pink-1.webp', Coffee: '/images/grip-socks-coffee-1.webp' }
        },
        'yoga-belt': {
            name: 'The Ritual Belt', weight: '96in', price: 499, url: '/products/the-ritual-belt',
            note: 'Cotton yoga strap',
            img: { Cream: '/images/yoga-belt-cream-1.webp', Black: '/images/yoga-belt-black-stretch.webp', Coffee: '/images/yoga-belt-coffee-roll.webp' }
        }
    };

    // What completes each product's set, in order of preference.
    var PAIRS = {
        'yoga-mat-5mm':      ['ankle-weights-2lb', 'pilates-ball', 'grip-socks', 'yoga-belt'],
        'ankle-weights-2lb': ['yoga-mat-5mm', 'pilates-ball', 'grip-socks', 'yoga-belt'],
        'pilates-ball':      ['yoga-mat-5mm', 'ankle-weights-2lb', 'grip-socks', 'yoga-belt'],
        'grip-socks':        ['yoga-mat-5mm', 'ankle-weights-2lb', 'pilates-ball', 'yoga-belt'],
        'yoga-belt':         ['yoga-mat-5mm', 'grip-socks', 'pilates-ball', 'ankle-weights-2lb'],
        'yoga-block':        ['yoga-mat-5mm', 'yoga-belt', 'grip-socks', 'pilates-ball'],
        'pilates-ring':      ['yoga-mat-5mm', 'ankle-weights-2lb', 'pilates-ball', 'grip-socks'],
        'capsule-dumbbell':  ['ankle-weights-2lb', 'yoga-mat-5mm', 'pilates-ball', 'grip-socks']
    };
    var SHOW = 3;
    var STOCK = null; // { productId: { cream: units, ... } } — null = unknown, show everything

    function selectedColour() {
        var s = document.querySelector('.swatches .swatch.is-selected, .swatches .swatch.selected, .swatches .swatch.active');
        var c = s && s.dataset.color;
        return SHADE[c] ? c : 'Cream';
    }

    function inStock(id, colour) {
        if (!STOCK) return true;
        var p = STOCK[id];
        if (!p) return false;
        return (p[colour.toLowerCase()] || 0) > 0;
    }

    // The colour to show a piece in: the shopper's colour if available, else the first in-stock one.
    function colourFor(id, wanted) {
        var colours = Object.keys(CATALOG[id].img);
        var order = [wanted].concat(['Cream', 'Pink', 'Black', 'Coffee'].filter(function (c) { return c !== wanted; }));
        for (var i = 0; i < order.length; i++) {
            if (colours.indexOf(order[i]) !== -1 && inStock(id, order[i])) return order[i];
        }
        return null;
    }

    function price(id) {
        var live = typeof window.getCurrentPrice === 'function' ? window.getCurrentPrice(id) : null;
        return Number(live) || CATALOG[id].price;
    }

    function rupees(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

    function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }

    function render() {
        var wanted = selectedColour();
        var picks = [];
        (PAIRS[current] || []).forEach(function (id) {
            if (picks.length >= SHOW || id === current || !CATALOG[id]) return;
            var c = colourFor(id, wanted);
            if (c) picks.push({ id: id, colour: c });
        });
        if (!picks.length) { mount.hidden = true; return; }
        mount.hidden = false;

        var matched = picks.every(function (p) { return p.colour === wanted; });
        var sub = matched
            ? 'Shown in ' + SHADE[wanted] + ' to match.'
            : 'Shown in ' + SHADE[wanted] + ' where available.';

        mount.innerHTML =
            '<p class="complete-set__eyebrow">Complete your set</p>' +
            '<h2 class="complete-set__title">Made to move together</h2>' +
            '<p class="complete-set__sub">' + esc(sub) + '</p>' +
            '<div class="complete-set__grid">' +
            picks.map(function (p) {
                var item = CATALOG[p.id];
                return '<article class="set-card">' +
                    '<a class="set-card__media" href="' + item.url + '?color=' + p.colour + '" aria-label="' + esc(item.name + ' in ' + SHADE[p.colour]) + '">' +
                        '<img src="' + item.img[p.colour] + '" alt="' + esc(item.name + ' in ' + SHADE[p.colour]) + '" loading="lazy" width="400" height="400">' +
                    '</a>' +
                    '<div class="set-card__body">' +
                        '<a class="set-card__name" href="' + item.url + '?color=' + p.colour + '">' + esc(item.name) + '</a>' +
                        '<p class="set-card__meta">' + esc(SHADE[p.colour]) + ' &middot; ' + esc(item.note) + '</p>' +
                        '<div class="set-card__row">' +
                            '<span class="set-card__price">' + rupees(price(p.id)) + '</span>' +
                            '<button type="button" class="set-card__add" data-id="' + p.id + '" data-colour="' + p.colour + '">Add</button>' +
                        '</div>' +
                    '</div>' +
                '</article>';
            }).join('') +
            '</div>';
    }

    mount.addEventListener('click', function (e) {
        var btn = e.target.closest('.set-card__add');
        if (!btn) return;
        var id = btn.dataset.id, colour = btn.dataset.colour, item = CATALOG[id];
        if (typeof Cart === 'undefined') { window.location = item.url + '?color=' + colour; return; }
        var line = { id: id, name: item.name, color: colour, price: price(id), image: item.img[colour] };
        if (item.weight) line.weight = item.weight;
        Cart.add(line);
        btn.textContent = 'Added';
        btn.classList.add('is-added');
        setTimeout(function () { btn.textContent = 'Add'; btn.classList.remove('is-added'); }, 2000);
        if (window.CartDrawer) CartDrawer.open();
    });

    // Re-render when the shopper picks another colour on the main product.
    document.addEventListener('click', function (e) {
        if (e.target.closest('.swatches .swatch')) setTimeout(render, 0);
    });

    render();
    fetch('/.netlify/functions/get-availability', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data) return;
            STOCK = {};
            Object.keys(data).forEach(function (pid) {
                STOCK[pid] = {};
                var cols = (data[pid] && data[pid].colors) || {};
                Object.keys(cols).forEach(function (k) { STOCK[pid][k] = Number(cols[k].stock) || 0; });
            });
            render();
        })
        .catch(function () { /* keep showing everything if stock can't load */ });
})();
