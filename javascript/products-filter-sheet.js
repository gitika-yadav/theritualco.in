(function () {
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    var statusRow = document.querySelector('.products-filters');
    var anyColourBtn = document.querySelector('[onclick*="filterByColor"]');
    var colourRow = anyColourBtn ? anyColourBtn.parentElement : document.querySelector('.products-color-filters');
    var cards = document.querySelectorAll('.product-card');
    if (!statusRow || !cards.length) return;
    if (colourRow && (colourRow === statusRow || colourRow.contains(statusRow) || statusRow.contains(colourRow))) colourRow = null;

    var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>';

    var bar = document.createElement('div');
    bar.className = 'pf-bar';
    bar.innerHTML = '<button type="button" class="pf-open">' + ICON + '<span>Filter</span><i class="pf-dot" hidden></i></button><span class="pf-count"></span>';

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'pf-fab';
    fab.innerHTML = ICON + '<span></span>';

    var overlay = document.createElement('div');
    overlay.className = 'pf-overlay';

    var sheet = document.createElement('div');
    sheet.className = 'pf-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Filter products');
    sheet.innerHTML =
        '<div class="pf-handle"></div>' +
        '<div class="pf-head"><h3>Filter</h3><button type="button" class="pf-close" aria-label="Close">&times;</button></div>' +
        '<div class="pf-scroll">' +
        '<section class="pf-section"><h4>Availability</h4><div class="pf-body" data-slot="status"></div></section>' +
        (colourRow ? '<section class="pf-section"><h4>Colour</h4><div class="pf-body" data-slot="colour"></div></section>' : '') +
        '</div>' +
        '<div class="pf-foot"><button type="button" class="pf-clear">Clear all</button><button type="button" class="pf-apply">Show <span class="pf-apply-n"></span> products</button></div>';

    statusRow.parentNode.insertBefore(bar, statusRow);
    sheet.querySelector('[data-slot="status"]').appendChild(statusRow);
    if (colourRow) sheet.querySelector('[data-slot="colour"]').appendChild(colourRow);
    document.body.appendChild(fab);
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    var countEl = bar.querySelector('.pf-count');
    var dot = bar.querySelector('.pf-dot');
    var applyN = sheet.querySelector('.pf-apply-n');
    var fabLabel = fab.querySelector('span');

    function firstBtn(row) { return row.querySelector('button'); }
    function isFiltered() {
        var s = statusRow.querySelector('.active');
        var c = colourRow && colourRow.querySelector('.active');
        return !!((s && s !== firstBtn(statusRow)) || (c && c !== firstBtn(colourRow)));
    }
    function refresh() {
        var n = 0;
        cards.forEach(function (c) { if (getComputedStyle(c).display !== 'none') n++; });
        countEl.textContent = n + (n === 1 ? ' product' : ' products');
        applyN.textContent = n;
        fabLabel.textContent = 'Filter · ' + n;
        dot.hidden = !isFiltered();
    }

    function open() { overlay.classList.add('is-open'); sheet.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
    function close() { overlay.classList.remove('is-open'); sheet.classList.remove('is-open'); document.body.style.overflow = ''; refresh(); }

    bar.querySelector('.pf-open').addEventListener('click', open);
    fab.addEventListener('click', open);
    overlay.addEventListener('click', close);
    sheet.querySelector('.pf-close').addEventListener('click', close);
    sheet.querySelector('.pf-apply').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    sheet.addEventListener('click', function (e) {
        if (e.target.closest('.pf-body button')) setTimeout(refresh, 0);
    });
    sheet.querySelector('.pf-clear').addEventListener('click', function () {
        firstBtn(statusRow).click();
        if (colourRow) firstBtn(colourRow).click();
        setTimeout(refresh, 0);
    });

    // Floating pill appears once the top bar scrolls out of view
    new IntersectionObserver(function (entries) {
        var e = entries[0];
        fab.classList.toggle('is-visible', !e.isIntersecting && e.boundingClientRect.top < 0);
    }).observe(bar);

    refresh();
})();