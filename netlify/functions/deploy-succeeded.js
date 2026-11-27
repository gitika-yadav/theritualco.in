// netlify/functions/deploy-succeeded.js
// Netlify runs this automatically after every successful production deploy
// (event-triggered function: the file name is the event).
//
// It pings IndexNow (Bing, Yandex, Seznam, Naver, Yep…) with the pages that
// changed, so new and updated pages get crawled in minutes instead of days.
// Google does not use IndexNow — it still reads sitemap.xml.
//
// "Changed" = sitemap <lastmod> within the last 2 days. lastmod is the page's
// last git commit date (see javascript/generate-sitemap.js), so this only
// sends pages touched by recent commits, never the whole site.
//
// The key is public by design: IndexNow verifies ownership by fetching
// https://theritualco.in/<key>.txt, which lives at the repo root.

const SITE = 'https://theritualco.in';
const HOST = 'theritualco.in';
const INDEXNOW_KEY = '288a05d56da5373fc076ed8e81bd1a7e';
const LOOKBACK_DAYS = 2;

function recentUrls(xml, sinceIso) {
    const urls = [];
    const blocks = xml.split('<url>').slice(1);
    for (const block of blocks) {
        const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
        const lastmod = (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
        if (loc && lastmod && lastmod >= sinceIso) urls.push(loc.trim());
    }
    return urls;
}

exports.handler = async (event) => {
    // Only production deploys of the live site
    try {
        const payload = JSON.parse(event.body || '{}').payload || {};
        if (payload.context && payload.context !== 'production') {
            console.log(`IndexNow: skipped (${payload.context} deploy)`);
            return { statusCode: 200, body: 'skipped' };
        }
    } catch (e) { /* no payload — carry on */ }

    try {
        const res = await fetch(`${SITE}/sitemap.xml`, { headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) throw new Error(`sitemap fetch ${res.status}`);
        const xml = await res.text();

        const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString().slice(0, 10);
        const urlList = recentUrls(xml, since).slice(0, 10000);

        if (!urlList.length) {
            console.log('IndexNow: no recently changed URLs');
            return { statusCode: 200, body: 'nothing to submit' };
        }

        const ping = await fetch('https://api.indexnow.org/indexnow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
                host: HOST,
                key: INDEXNOW_KEY,
                keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
                urlList,
            }),
        });

        // 200 = accepted, 202 = accepted (key validation pending)
        console.log(`IndexNow: ${ping.status} for ${urlList.length} URLs`, urlList);
        return { statusCode: 200, body: `submitted ${urlList.length}` };
    } catch (err) {
        // Never fail the deploy over this
        console.error('IndexNow error:', err.message);
        return { statusCode: 200, body: 'error logged' };
    }
};
