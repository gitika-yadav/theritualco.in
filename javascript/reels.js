/* Reels row: self-hosted, silent, looping videos (no Instagram frame).
   Usage: <section class="reels" data-reels="oat-latte,vanilla-cream,ankle-weights" data-title="..." data-sub="..."></section>
   Videos load only when the row nears the screen and play only while visible. */
(function () {
  var REELS = {
    'oat-latte':       { src: '/videos/reel-kit-oat-latte.mp4',  poster: '/videos/reel-kit-oat-latte.jpg',  label: 'Oat Latte Kit',       ig: 'https://www.instagram.com/reel/Dfj7_VgsVs6/' },
    'vanilla-cream':   { src: '/videos/reel-kit-cream.mp4',      poster: '/videos/reel-kit-cream.jpg',      label: 'Vanilla Cream Kit',   ig: 'https://www.instagram.com/theritualco.in/' },
    'strawberry-milk': { src: '/videos/reel-kit-pink.mp4',       poster: '/videos/reel-kit-pink.jpg',       label: 'Strawberry Milk Kit', ig: 'https://www.instagram.com/reel/DfZZvHCprK7/' },
    'onyx-black':      { src: '/videos/reel-kit-black.mp4',      poster: '/videos/reel-kit-black.jpg',      label: 'Onyx Black Kit',      ig: 'https://www.instagram.com/theritualco.in/' },
    'ankle-weights':   { src: '/videos/reel-ankle-weights.mp4',  poster: '/videos/reel-ankle-weights.jpg',  label: 'The Ritual Cuffs',    ig: 'https://www.instagram.com/reel/DfEP6TcJ2QI/' }
  };

  var rows = document.querySelectorAll('section.reels[data-reels]');
  if (!rows.length) return;

  var css = document.createElement('style');
  css.textContent =
    '.reels{padding:72px 0 64px;text-align:center;}' +
    '.reels__eyebrow{font-family:"DM Sans","Inter",sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a7f76;margin:0 0 10px;}' +
    '.reels__title{font-family:"Cormorant Garamond",Georgia,serif;font-weight:400;font-size:clamp(28px,4vw,40px);color:#2a2420;margin:0 0 8px;line-height:1.15;}' +
    '.reels__sub{font-family:"DM Sans","Inter",sans-serif;font-size:14px;color:#8a7f76;margin:0 0 32px;}' +
    '.reels__track{display:flex;gap:18px;justify-content:center;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 24px 14px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}' +
    '.reels__track::-webkit-scrollbar{display:none;}' +
    '.reels__card{flex:0 0 230px;scroll-snap-align:center;text-decoration:none;color:inherit;display:block;}' +
    '.reels__frame{position:relative;aspect-ratio:9/16;border-radius:18px;overflow:hidden;background:#ece4da;box-shadow:0 12px 30px rgba(42,36,32,.10);transition:transform .3s ease,box-shadow .3s ease;}' +
    '.reels__card:hover .reels__frame{transform:translateY(-3px);box-shadow:0 18px 36px rgba(42,36,32,.14);}' +
    '.reels__frame video{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.reels__label{display:block;margin-top:12px;font-family:"Cormorant Garamond",Georgia,serif;font-size:19px;color:#2a2420;}' +
    '.reels__follow{display:inline-block;margin-top:26px;font-family:"DM Sans","Inter",sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#2a2420;text-decoration:none;border-bottom:1px solid #c8b8a6;padding-bottom:3px;}' +
    '@media(max-width:1260px){.reels__track{justify-content:flex-start;}}' +
    '@media(max-width:600px){.reels{padding:56px 0 48px;}.reels__card{flex-basis:62vw;}}';
  document.head.appendChild(css);

  var videos = [];
  rows.forEach(function (row) {
    var keys = row.getAttribute('data-reels').split(',').map(function (s) { return s.trim(); }).filter(function (k) { return REELS[k]; });
    var html = '<p class="reels__eyebrow">On Instagram</p>' +
      '<h2 class="reels__title">' + (row.getAttribute('data-title') || 'Ritual in motion') + '</h2>' +
      '<p class="reels__sub">' + (row.getAttribute('data-sub') || 'Real rituals, filmed with our pieces.') + '</p><div class="reels__track">';
    keys.forEach(function (k) {
      var r = REELS[k];
      html += '<a class="reels__card" href="' + r.ig + '" target="_blank" rel="noopener" aria-label="' + r.label + ' on Instagram">' +
        '<span class="reels__frame"><video muted loop playsinline preload="none" poster="' + r.poster + '" data-src="' + r.src + '"></video></span>' +
        '<span class="reels__label">' + r.label + '</span></a>';
    });
    html += '</div><a class="reels__follow" href="https://www.instagram.com/theritualco.in/" target="_blank" rel="noopener">Follow @theritualco.in</a>';
    row.innerHTML = html;
    row.querySelectorAll('video').forEach(function (v) { videos.push(v); });
  });

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function start(v) {
    if (!v.src) { v.src = v.getAttribute('data-src'); }
    if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  }
  if (!('IntersectionObserver' in window)) { videos.forEach(start); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) start(e.target); else if (!e.target.paused) e.target.pause();
    });
  }, { rootMargin: '200px 0px', threshold: 0.2 });
  videos.forEach(function (v) { io.observe(v); });
})();
