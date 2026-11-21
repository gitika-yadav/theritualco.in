/* "Your Ritual" collection tracker for the account page.
   Shows which of the 8 Ritual pieces a customer owns (from their orders, kits expanded)
   and what's left to complete the set. Usage: renderRitualCollection(orders, element) */
(function () {
  var PIECES = [
    { key: 'mat',       name: 'The Ritual Mat',     url: '/products/the-ritual-mat',     img: '/images/yoga-mat-all-colours.webp' },
    { key: 'ring',      name: 'The Ritual Ring',    url: '/products/the-ritual-ring',    img: '/images/the-ritual-ring-all-colours.webp' },
    { key: 'ball',      name: 'The Ritual Ball',    url: '/products/the-ritual-ball',    img: '/images/pilates-ball-black.webp' },
    { key: 'dumbbells', name: 'Capsule Dumbbells',  url: '/products/capsule-dumbbell',   img: '/images/capsule-dumbbell-black.webp' },
    { key: 'cuffs',     name: 'The Ritual Cuffs',   url: '/products/the-ritual-cuffs',   img: '/images/cuffs-black-wrists.webp' },
    { key: 'socks',     name: 'The Ritual Socks',   url: '/products/the-ritual-socks',   img: '/images/grip-socks-cream-1.webp' },
    { key: 'belt',      name: 'The Ritual Belt',    url: '/products/the-ritual-belt',    img: '/images/yoga-belt-cream-2.webp' },
    { key: 'block',     name: 'The Ritual Block',   url: '/products/the-ritual-block',   img: '/images/block-pink-backbend.webp' }
  ];
  // product_id in orders -> pieces it contains
  var MAP = {
    'yoga-mat-5mm': ['mat'], 'pilates-ring': ['ring'], 'pilates-ball': ['ball'],
    'capsule-1kg': ['dumbbells'], 'capsule-2kg': ['dumbbells'], 'ankle-weights-2lb': ['cuffs'],
    'grip-socks': ['socks'], 'grip-socks-trio': ['socks'], 'yoga-belt': ['belt'], 'yoga-block': ['block'],
    'pilates-starter-kit':  ['mat', 'ring', 'ball', 'dumbbells'],
    'pilates-sculpt-kit':   ['ring', 'ball', 'dumbbells', 'cuffs'],
    'pilates-complete-kit': ['mat', 'ring', 'ball', 'dumbbells', 'cuffs', 'block'],
    'yoga-essentials-kit':  ['mat', 'belt', 'block'],
    'yoga-studio-kit':      ['belt', 'block']
  };
  // Orders that don't count as owned
  var SKIP = { pending: 1, cancelled: 1, refunded: 1, rto: 1, returned: 1, failed: 1 };

  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  window.renderRitualCollection = function (orders, el) {
    if (!el) return;
    var owned = {}; // key -> Set of colours
    (orders || []).forEach(function (o) {
      if (SKIP[o.status]) return;
      (o.items || []).forEach(function (i) {
        var pid = i.product_id || i.id || '';
        var keys = MAP[pid];
        if (!keys) {
          var n = (i.product_name || '').toLowerCase();
          if (/starter kit/.test(n)) keys = MAP['pilates-starter-kit'];
          else if (/sculpt kit/.test(n)) keys = MAP['pilates-sculpt-kit'];
          else if (/complete kit/.test(n)) keys = MAP['pilates-complete-kit'];
          else if (/essentials kit/.test(n)) keys = MAP['yoga-essentials-kit'];
          else if (/studio kit/.test(n)) keys = MAP['yoga-studio-kit'];
          else PIECES.forEach(function (p) { if (n.indexOf(p.key === 'dumbbells' ? 'dumbbell' : p.key) !== -1) keys = [p.key]; });
        }
        (keys || []).forEach(function (k) {
          owned[k] = owned[k] || [];
          if (i.color && owned[k].indexOf(i.color) === -1) owned[k].push(i.color);
        });
      });
    });

    var have = PIECES.filter(function (p) { return owned[p.key]; });
    var left = PIECES.filter(function (p) { return !owned[p.key]; });
    var pct = Math.round(have.length / PIECES.length * 100);
    var line = have.length === PIECES.length
      ? 'You have the complete Ritual collection. Thank you for being part of it.'
      : have.length === 0
        ? 'Start your collection: eight pieces, four colours, one ritual.'
        : left.length + ' piece' + (left.length === 1 ? '' : 's') + ' left to complete your ritual.';

    function tile(p, isOwned) {
      var meta = isOwned
        ? '<span class="rc-tag rc-tag--own">✓ ' + (owned[p.key].length ? esc(owned[p.key].join(', ')) : 'In your ritual') + '</span>'
        : '<span class="rc-tag">Add to your ritual →</span>';
      return '<a class="rc-tile' + (isOwned ? ' is-owned' : '') + '" href="' + p.url + '">' +
        '<span class="rc-img"><img src="' + p.img + '" alt="' + esc(p.name) + '" loading="lazy"/></span>' +
        '<span class="rc-name">' + esc(p.name) + '</span>' + meta + '</a>';
    }

    el.innerHTML =
      '<div class="rc">' +
        '<div class="rc-head"><div><p class="rc-eyebrow">Your Ritual</p>' +
        '<h2 class="rc-title">' + have.length + ' of ' + PIECES.length + ' pieces</h2></div>' +
        '<span class="rc-pct">' + pct + '%</span></div>' +
        '<div class="rc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + PIECES.length + '" aria-valuenow="' + have.length + '"><span style="width:' + pct + '%"></span></div>' +
        '<p class="rc-line">' + line + '</p>' +
        '<div class="rc-grid">' + have.map(function (p) { return tile(p, true); }).join('') + left.map(function (p) { return tile(p, false); }).join('') + '</div>' +
      '</div>';

    // animate the bar in
    var bar = el.querySelector('.rc-bar span');
    if (bar) { bar.style.width = '0'; requestAnimationFrame(function () { setTimeout(function () { bar.style.width = pct + '%'; }, 60); }); }
  };

  var css = document.createElement('style');
  css.textContent =
    '.rc{background:#fff;border:1px solid #e8e2dc;border-radius:16px;padding:26px 24px 22px;margin-bottom:32px;}' +
    '.rc-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;}' +
    '.rc-eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#a09890;margin:0 0 6px;}' +
    '.rc-title{font-family:"Cormorant Garamond",Georgia,serif;font-weight:400;font-size:28px;color:#2a2420;margin:0;font-variant-numeric:lining-nums;}' +
    '.rc-pct{font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;color:#8a7f76;font-variant-numeric:lining-nums;}' +
    '.rc-bar{height:6px;background:#f1ebe4;border-radius:999px;overflow:hidden;}' +
    '.rc-bar span{display:block;height:100%;background:linear-gradient(90deg,#c8b8a6,#6f4e37);border-radius:999px;transition:width 1.1s cubic-bezier(.2,.7,.2,1);}' +
    '.rc-line{font-size:13px;color:#7a6f68;margin:12px 0 20px;}' +
    '.rc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}' +
    '.rc-tile{display:flex;flex-direction:column;text-decoration:none;color:inherit;}' +
    '.rc-img{display:block;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:#f3ede6;}' +
    '.rc-img img{width:100%;height:100%;object-fit:cover;display:block;filter:grayscale(1);opacity:.45;transition:filter .3s,opacity .3s,transform .4s;}' +
    '.rc-tile.is-owned .rc-img img{filter:none;opacity:1;}' +
    '.rc-tile:hover .rc-img img{filter:none;opacity:1;transform:scale(1.04);}' +
    '.rc-name{font-family:"Cormorant Garamond",Georgia,serif;font-size:16px;color:#2a2420;margin-top:8px;line-height:1.2;}' +
    '.rc-tag{font-size:10.5px;letter-spacing:.04em;color:#a09890;margin-top:3px;}' +
    '.rc-tag--own{color:#5a4636;}' +
    '@media(max-width:560px){.rc-grid{grid-template-columns:repeat(2,1fr);}.rc{padding:22px 18px;}}';
  document.head.appendChild(css);
})();
