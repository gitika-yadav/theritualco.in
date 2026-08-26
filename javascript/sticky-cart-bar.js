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

    if (mainImg && stickyImg) stickyImg.src = mainImg.src;
    if (titleEl && stickyName) stickyName.textContent = titleEl.textContent.replace(/\s+/g, ' ').trim();
    if (priceEl && stickyPrice) stickyPrice.textContent = priceEl.textContent;

    // Keep sticky image synced when a colour swatch changes the main photo
    if (mainImg && stickyImg) {
        new MutationObserver(function () { stickyImg.src = mainImg.src; })
            .observe(mainImg, { attributes: true, attributeFilter: ['src'] });
    }

    // Show only once the real button has scrolled above the viewport
    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                bar.classList.remove('is-visible');
            } else if (entry.boundingClientRect.top < 0) {
                bar.classList.add('is-visible');
            } else {
                bar.classList.remove('is-visible');
            }
        });
    }, { threshold: 0 });
    observer.observe(mainBtn);

    // Reuses whatever colour/price logic is already wired to the real button —
    // no duplicated Cart.add() call needed
    stickyBtn.addEventListener('click', function () { mainBtn.click(); });
})();