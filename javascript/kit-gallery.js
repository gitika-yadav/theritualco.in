/* Kit pages: thumbnail gallery under the main photo, like single-product pages.
   Thumbs = the kit's main colour photo + each piece in the kit (current colour).
   Rebuilds when the shopper picks another colour. */
(function () {
  var main = document.getElementById('main-img');
  var visual = main && main.closest('.product__visual');
  if (!visual) return;

  var css = document.createElement('style');
  css.textContent =
    'body.tr-product-page .product__media{position:sticky;top:84px;align-self:start;}' +
    '.product__thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;justify-content:center;}' +
    '.product__thumbs .thumb{width:56px;height:56px;border-radius:6px;overflow:hidden;border:2px solid transparent;padding:0;cursor:pointer;background:none;flex-shrink:0;}' +
    '.product__thumbs .thumb img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.product__thumbs .thumb.active{border-color:#3a3330;}' +
    '@media (max-width:768px){body.tr-product-page .product__media{position:relative;top:0;}' +
    '.product__thumbs{margin-top:8px;gap:6px;}.product__thumbs .thumb{width:44px;height:44px;}}';
  document.head.appendChild(css);

  var media = document.createElement('div');
  media.className = 'product__media';
  visual.parentNode.insertBefore(media, visual);
  media.appendChild(visual);
  var strip = document.createElement('div');
  strip.className = 'product__thumbs';
  media.appendChild(strip);

  function currentMainSrc() {
    var sw = document.querySelector('.swatch.is-selected');
    return (sw && sw.dataset.img) || main.getAttribute('src');
  }

  function build() {
    var items = [{ src: currentMainSrc(), alt: main.alt }];
    document.querySelectorAll('.kit-contents__img').forEach(function (img) {
      items.push({ src: img.getAttribute('src'), alt: img.alt });
    });
    var seen = {};
    strip.innerHTML = '';
    items.forEach(function (it, i) {
      if (!it.src || seen[it.src]) return;
      seen[it.src] = 1;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb' + (i === 0 ? ' active' : '');
      b.setAttribute('aria-label', 'View ' + (it.alt || 'photo'));
      var im = document.createElement('img');
      im.src = it.src;
      im.alt = it.alt || '';
      if (i > 0) im.loading = 'lazy';
      b.appendChild(im);
      b.addEventListener('click', function () {
        main.src = it.src;
        strip.querySelectorAll('.thumb').forEach(function (t) { t.classList.remove('active'); });
        b.classList.add('active');
      });
      strip.appendChild(b);
    });
  }

  build();
  document.querySelectorAll('.swatch').forEach(function (s) {
    s.addEventListener('click', function () { setTimeout(build, 0); });
  });
})();
