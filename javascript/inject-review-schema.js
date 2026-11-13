// inject-review-schema.js — runs at Netlify build time (see netlify.toml)
//
// Reviews load in the browser via /javascript/reviews.js, so Google never sees them in the
// page source. This writes each product's approved reviews into its Product JSON-LD
// (aggregateRating + up to 10 reviews) so star ratings can show in search results.
//
// - Matches reviews to pages by window.PRODUCT_SLUG (same key reviews.js uses).
// - Only edits the built copy on Netlify; nothing is committed back to the repo.
// - New reviews appear after the next deploy.
// - If Supabase is unreachable or env vars are missing, it logs and exits 0 (build never fails).

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PRODUCTS_DIR = path.join(ROOT, "products");
const MAX_REVIEWS = 10;

async function fetchReviews() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY not set for the build");
    const res = await fetch(
        `${url}/rest/v1/reviews?select=product,name,rating,body,created_at&approved=eq.true&order=created_at.desc`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) throw new Error(`Supabase responded ${res.status}`);
    return res.json();
}

function firstName(name) {
    return String(name || "Verified buyer").trim().split(/\s+/)[0] || "Verified buyer";
}

(async () => {
    let reviews;
    try {
        reviews = await fetchReviews();
    } catch (err) {
        console.warn(`⚠️  Review schema skipped: ${err.message}`);
        return;
    }

    const byProduct = {};
    for (const r of reviews) {
        const rating = Number(r.rating);
        if (!r.product || !(rating >= 1 && rating <= 5)) continue;
        (byProduct[r.product] = byProduct[r.product] || []).push({ ...r, rating });
    }

    let updated = 0;
    for (const file of fs.readdirSync(PRODUCTS_DIR).filter((f) => f.endsWith(".html"))) {
        const filePath = path.join(PRODUCTS_DIR, file);
        let html = fs.readFileSync(filePath, "utf8");

        const slugMatch = html.match(/PRODUCT_SLUG\s*=\s*['"]([^'"]+)['"]/);
        const list = slugMatch && byProduct[slugMatch[1]];
        if (!list || !list.length) continue;

        let changed = false;
        html = html.replace(
            /(<script[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
            (whole, open, body, close) => {
                let data;
                try { data = JSON.parse(body); } catch (e) { return whole; }
                if (!data || data["@type"] !== "Product") return whole;

                const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
                data.aggregateRating = {
                    "@type": "AggregateRating",
                    ratingValue: avg.toFixed(1),
                    reviewCount: list.length,
                    bestRating: "5",
                    worstRating: "1",
                };
                data.review = list.slice(0, MAX_REVIEWS).map((r) => ({
                    "@type": "Review",
                    author: { "@type": "Person", name: firstName(r.name) },
                    datePublished: String(r.created_at || "").slice(0, 10) || undefined,
                    reviewBody: String(r.body || "").slice(0, 1000),
                    reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5", worstRating: "1" },
                }));
                changed = true;
                return `${open}\n${JSON.stringify(data, null, 4)}\n${close}`;
            }
        );

        if (changed) {
            fs.writeFileSync(filePath, html, "utf8");
            updated++;
            console.log(`⭐ ${file}: ${list.length} review(s)`);
        }
    }
    console.log(`✅ Review schema injected into ${updated} product page(s)`);
})();
