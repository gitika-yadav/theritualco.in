/* ════════════════════════════════════════════════════════════════
   The Ritual Co. — Shared product reviews frontend
   File: /javascript/reviews.js

   Talks to YOUR existing Netlify functions (unchanged):
     GET  /.netlify/functions/get-reviews     → all approved reviews
     POST /.netlify/functions/submit-review   → { name, product, rating, body }

   No Supabase keys in the browser — everything stays server-side.

   Usage on any product page (before this script):
     <script>window.PRODUCT_SLUG = 'yoga-belt';</script>
     <script src="/javascript/reviews.js"></script>

   Page hooks expected:
     #reviews-list, #reviews-avg, #reviews-total,
     #review-form, #review-name, #review-rating,
     #review-text, #review-status
   ════════════════════════════════════════════════════════════════ */

(function () {
    const PRODUCT = window.PRODUCT_SLUG;
    if (!PRODUCT) {
        console.error('[reviews] window.PRODUCT_SLUG is not set on this page.');
        return;
    }

    const listEl   = document.getElementById('reviews-list');
    const avgEl    = document.getElementById('reviews-avg');
    const totalEl  = document.getElementById('reviews-total');
    const formEl   = document.getElementById('review-form');
    const statusEl = document.getElementById('review-status');

    const STAR_SVG =
        '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.9 4.2 4.6.4-3.5 3 1 4.5L8 10.7 4 13.1l1-4.5-3.5-3 4.6-.4z"/></svg>';

    function starsHtml(rating) {
        return '<div class="stars" aria-label="' + rating + ' stars">'
            + STAR_SVG.repeat(rating) + '</div>';
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function cardHtml(r) {
        return (
            '<article class="review-card">' +
            starsHtml(r.rating) +
            '<p class="review-card__text">&ldquo;' + esc(r.body) + '&rdquo;</p>' +
            '<p class="review-card__author">' + esc(r.name) +
            '<span>Verified buyer</span></p>' +
            '</article>'
        );
    }

    /* ── Load approved reviews via your get-reviews function ──
       The function returns ALL products' approved reviews;
       we filter to this page's product client-side.          */
    async function loadReviews() {
        let data;
        try {
            const res = await fetch('/.netlify/functions/get-reviews');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            data = await res.json();
        } catch (err) {
            console.error('[reviews] load failed:', err);
            return; // leave whatever is in the list untouched on failure
        }

        const reviews = (Array.isArray(data) ? data : [])
            .filter(r => r.product === PRODUCT);

        if (reviews.length === 0) {
            listEl.innerHTML =
                '<p style="grid-column:1/-1;text-align:center;color:var(--secondary);font-size:13px;">' +
                'No reviews yet — be the first to share your experience.</p>';
            if (avgEl) avgEl.textContent = '–';
            if (totalEl) totalEl.textContent = '0';
            return;
        }

        listEl.innerHTML = reviews.map(cardHtml).join('');

        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
        if (avgEl) avgEl.textContent = avg.toFixed(1);
        if (totalEl) totalEl.textContent = String(reviews.length);
    }

    /* ── Submit via your submit-review function ──
       Payload shape matches its validation exactly:
       rating must be a NUMBER, review text goes in `body`. */
    async function submitReview(e) {
        e.preventDefault();

        const name   = document.getElementById('review-name').value.trim();
        const rating = parseInt(document.getElementById('review-rating').value, 10);
        const text   = document.getElementById('review-text').value.trim();

        if (!rating || rating < 1 || rating > 5) {
            statusEl.textContent = 'Please select a star rating.';
            return;
        }
        if (!name || !text) {
            statusEl.textContent = 'Please fill in your name and review.';
            return;
        }
        if (name.length > 80) {
            statusEl.textContent = 'Name must be under 80 characters.';
            return;
        }
        if (text.length > 1000) {
            statusEl.textContent = 'Review must be under 1000 characters.';
            return;
        }

        statusEl.textContent = 'Submitting…';

        try {
            const res = await fetch('/.netlify/functions/submit-review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    product: PRODUCT,   // hardcoded per page
                    rating: rating,     // number — required by server validation
                    body: text          // server expects review text as `body`
                })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Submission failed');
        } catch (err) {
            console.error('[reviews] submit failed:', err);
            statusEl.textContent = 'Something went wrong. Please try again.';
            return;
        }

        formEl.reset();
        document.getElementById('review-rating').value = '0';
        document.querySelectorAll('#rating-input button')
            .forEach(b => b.classList.remove('filled'));
        statusEl.textContent =
            'Thank you! Your review will appear once it\u2019s approved.';
    }

    formEl.addEventListener('submit', submitReview);
    loadReviews();
})();