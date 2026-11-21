/* Instagram reels row.
   Usage: <section class="reels" data-reels="REEL_ID,REEL_ID" data-title="Ritual in motion"></section>
   Uses Instagram's official embed; embed.js is only loaded when the row scrolls near view. */
(function () {
  var rows = document.querySelectorAll('section.reels[data-reels]');
  if (!rows.length) return;

  var css = document.createElement('style');
  css.textContent =
    '.reels{padding:72px 0 64px;text-align:center;}' +
    '.reels__eyebrow{font-family:"DM Sans","Inter",sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a7f76;margin:0 0 10px;}' +
    '.reels__title{font-family:"Cormorant Garamond",Georgia,serif;font-weight:400;font-size:clamp(28px,4vw,40px);color:#2a2420;margin:0 0 8px;line-height:1.15;}' +
    '.reels__sub{font-family:"DM Sans","Inter",sans-serif;font-size:14px;color:#8a7f76;margin:0 0 32px;}' +
    '.reels__track{display:flex;gap:20px;justify-content:center;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 24px 12px;-webkit-overflow-scrolling:touch;}' +
    '.reels__card{flex:0 0 328px;scroll-snap-align:center;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 10px 30px rgba(42,36,32,.08);min-height:560px;}' +
    '.reels__card .instagram-media{margin:0!important;min-width:326px!important;max-width:328px!important;width:100%!important;border:0!important;box-shadow:none!important;border-radius:16px!important;}' +
    '.reels__follow{display:inline-block;margin-top:24px;font-family:"DM Sans","Inter",sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#2a2420;text-decoration:none;border-bottom:1px solid #c8b8a6;padding-bottom:3px;}' +
    '@media(max-width:1060px){.reels__track{justify-content:flex-start;}}';
  document.head.appendChild(css);

  rows.forEach(function (row) {
    var ids = row.getAttribute('data-reels').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var title = row.getAttribute('data-title') || 'Ritual in motion';
    var sub = row.getAttribute('data-sub') || 'Real rituals, filmed with our pieces.';
    var html = '<p class="reels__eyebrow">On Instagram</p>' +
      '<h2 class="reels__title">' + title + '</h2>' +
      '<p class="reels__sub">' + sub + '</p><div class="reels__track">';
    ids.forEach(function (id) {
      var url = 'https://www.instagram.com/reel/' + id + '/';
      html += '<div class="reels__card"><blockquote class="instagram-media" data-instgrm-permalink="' + url +
        '?utm_source=ig_embed" data-instgrm-version="14"><a href="' + url + '" target="_blank" rel="noopener">Watch on Instagram</a></blockquote></div>';
    });
    html += '</div><a class="reels__follow" href="https://www.instagram.com/theritualco.in/" target="_blank" rel="noopener">Follow @theritualco.in</a>';
    row.innerHTML = html;
  });

  var loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    if (window.instgrm) { window.instgrm.Embeds.process(); return; }
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.instagram.com/embed.js';
    document.body.appendChild(s);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { load(); io.disconnect(); }
    }, { rootMargin: '600px' });
    rows.forEach(function (r) { io.observe(r); });
  } else { load(); }
})();
