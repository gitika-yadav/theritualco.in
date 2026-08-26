(function () {
    var slides = document.querySelectorAll('.hero-slide');
    var dots = document.querySelectorAll('.hero-dot');
    var counterCurrent = document.getElementById('hero-counter-current');
    if (!slides.length) return;

    var current = 0;
    var interval;
    var AUTO_MS = 4500;

    function goTo(index) {
        slides[current].classList.remove('is-active');
        dots[current].classList.remove('is-active');
        current = (index + slides.length) % slides.length;
        slides[current].classList.add('is-active');
        dots[current].classList.add('is-active');
        if (counterCurrent) counterCurrent.textContent = current + 1;
    }
    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }
    function startAuto() { interval = setInterval(next, AUTO_MS); }
    function stopAuto() { clearInterval(interval); }

    var nextBtn = document.querySelector('.hero-nav--next');
    var prevBtn = document.querySelector('.hero-nav--prev');
    if (nextBtn) nextBtn.addEventListener('click', function () { stopAuto(); next(); startAuto(); });
    if (prevBtn) prevBtn.addEventListener('click', function () { stopAuto(); prev(); startAuto(); });
    dots.forEach(function (dot, i) {
        dot.addEventListener('click', function () { stopAuto(); goTo(i); startAuto(); });
    });

    var carousel = document.getElementById('hero-carousel');
    if (carousel) {
        carousel.addEventListener('mouseenter', stopAuto);
        carousel.addEventListener('mouseleave', startAuto);
    }
    startAuto();
})();