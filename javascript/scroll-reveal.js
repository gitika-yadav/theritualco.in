(function () {
    var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var revealEls = document.querySelectorAll('.reveal');

    if (prefersReduced) {
        revealEls.forEach(function (el) { el.classList.add('is-visible'); });
        return;
    }

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -80px 0px' });

    revealEls.forEach(function (el) { observer.observe(el); });

    // Stagger: wrap a group in <div data-stagger="120"> and give each direct
    // child class="reveal" — they'll cascade in one after another.
    document.querySelectorAll('[data-stagger]').forEach(function (container) {
        var gap = parseInt(container.dataset.stagger, 10) || 100;
        var children = container.querySelectorAll(':scope > .reveal');
        children.forEach(function (child, i) {
            child.style.transitionDelay = (i * gap) + 'ms';
        });
    });
})();