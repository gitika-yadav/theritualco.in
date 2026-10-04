// javascript/home-v2.js
// The hero shows the dumbbells in each colourway. Picking a colour (or letting
// it autoplay) swaps the photo AND recolours the whole hero panel.
(function () {
    var hero = document.getElementById('v2-hero');
    if (!hero) return;

    var imgs = hero.querySelectorAll('.v2-hero__media img');
    var swatches = hero.querySelectorAll('.v2-swatch');
    var nameEl = document.getElementById('v2-colour-name');
    var media = hero.querySelector('.v2-hero__media');
    var current = 0;
    var timer = null;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function show(i) {
        current = (i + swatches.length) % swatches.length;
        imgs.forEach(function (img, n) { img.classList.toggle('is-active', n === current); });
        swatches.forEach(function (s, n) {
            s.classList.toggle('is-active', n === current);
            s.setAttribute('aria-pressed', n === current ? 'true' : 'false');
        });
        hero.setAttribute('data-theme', swatches[current].dataset.theme);
        if (nameEl) nameEl.textContent = swatches[current].dataset.name;
    }

    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { if (!reduce && !timer) timer = setInterval(function () { show(current + 1); }, 4500); }

    swatches.forEach(function (s, n) {
        s.addEventListener('click', function () { stop(); show(n); });
    });

    // Swipe on the photo
    var startX = null;
    media.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; stop(); }, { passive: true });
    media.addEventListener('touchend', function (e) {
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
        startX = null;
    });

    // Don't burn cycles in background tabs
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : (timer === null && !hero.dataset.touched && start()); });
    swatches.forEach(function (s) { s.addEventListener('click', function () { hero.dataset.touched = '1'; }); });

    show(0);
    start();
})();