const isCapsuleOutOfStock =
    window.location.pathname.includes('/products/capsule-dumbbell');

(function () {
    var bar = document.getElementById('sticky-cart-bar');
    var mainBtn = document.getElementById('preorder-btn');
    if (!bar || !mainBtn) return;

    var mainImg = document.getElementById('main-img');
    var titleEl = document.querySelector('.product__title');
    var priceEl = document.getElementById('price-launch');

    var stickyImg = document.getElementById('sticky-cart-img');
    var stickyName = document.getElementById('sticky-cart-name');
    var stickyPrice = document.getElementById('sticky-cart-price');
    var stickyBtn = document.getElementById('sticky-cart-btn');

    // Infographic slides (comparison / benefits) aren't product photos — keep the last real photo.
    function isInfographic(src) { return /-(comparison|benefits)\./.test(src || ''); }
    function syncImg() { if (!isInfographic(mainImg.src)) stickyImg.src = mainImg.src; }
    if (mainImg && stickyImg) syncImg();
    if (titleEl && stickyName) stickyName.textContent = titleEl.innerHTML.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    // Price shown = the visible one in the price block (socks swaps Solo/Trio
    // rows), kept in sync when it changes. Button text mirrors the main button
    // (e.g. "Pre-order · Ships in December").
    var priceBlock = document.querySelector('.price-block');
    function visiblePrice() {
        var all = priceBlock ? priceBlock.querySelectorAll('.price') : [];
        for (var i = 0; i < all.length; i++) if (all[i].offsetParent !== null) return all[i];
        return priceEl;
    }
    function syncText() {
        var p = visiblePrice();
        if (p && stickyPrice) stickyPrice.textContent = p.textContent;
        if (stickyBtn) {
            stickyBtn.textContent = mainBtn.textContent.trim();
            stickyBtn.disabled = !!mainBtn.disabled;
        }
    }
    syncText();
    var textObs = new MutationObserver(syncText);
    if (priceBlock) textObs.observe(priceBlock, { attributes: true, childList: true, subtree: true, characterData: true });
    textObs.observe(mainBtn, { attributes: true, childList: true, subtree: true, characterData: true });

    // Keep sticky image synced when a colour swatch changes the main photo
    if (mainImg && stickyImg) {
        new MutationObserver(syncImg)
            .observe(mainImg, { attributes: true, attributeFilter: ['src'] });
    }

    // Show whenever the real button is off screen: above it (not reached yet,
    // so price + Add to Cart are on the very first screen) or below it
    // (scrolled past). Hidden while the real button itself is visible.
    // The bar's CSS keeps it to phones and tablets.
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            bar.classList.toggle('is-visible', !entry.isIntersecting);
        });
    }, { threshold: 0 });
    observer.observe(mainBtn);

    // Reuses whatever colour/price logic is already wired to the real button —
    // no duplicated Cart.add() call needed
    stickyBtn.addEventListener('click', function () { mainBtn.click(); });
})();