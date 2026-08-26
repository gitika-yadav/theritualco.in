(function () {
    var searchBtn = document.getElementById('nav-search-btn');
    var overlay = document.getElementById('search-overlay');
    var input = document.getElementById('search-input');
    var resultsEl = document.getElementById('search-results');
    var emptyEl = document.getElementById('search-empty');
    var closeBtn = document.getElementById('search-close');

    if (!searchBtn || !overlay) return;

    function open() {
        overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        setTimeout(function () { input.focus(); }, 150);
    }
    function close() {
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        input.value = '';
        render([]);
    }

    function render(items) {
        if (items.length === 0) {
            resultsEl.innerHTML = '';
            emptyEl.style.display = input.value.trim() ? 'block' : 'none';
            return;
        }
        emptyEl.style.display = 'none';
        resultsEl.innerHTML = items.map(function (item) {
            return '<a class="search-result" href="' + item.url + '">' +
                '<img src="' + item.image + '" alt=""/>' +
                '<div class="search-result-text">' +
                '<span class="search-result-name">' + item.name + '</span>' +
                '<span class="search-result-desc">' + item.desc + '</span>' +
                '</div>' +
                '</a>';
        }).join('');
    }

    function doSearch(query) {
        var q = query.trim().toLowerCase();
        if (!q) { render([]); return; }
        var index = window.RITUAL_SEARCH_INDEX || [];
        var matches = index.filter(function (item) {
            var haystack = (item.name + ' ' + item.desc + ' ' + item.tags).toLowerCase();
            return haystack.indexOf(q) !== -1;
        });
        render(matches);
    }

    searchBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    input.addEventListener('input', function () { doSearch(input.value); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); }
    });
})();