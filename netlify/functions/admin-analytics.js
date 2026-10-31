// netlify/functions/admin-results.js
// Weekly results for admin/results.html — one call, three sources:
//   1. Supabase (always): sales, products, payment mix, gifts, recovered carts,
//      delivery, events, reviews
//   2. Meta Marketing API (optional): spend, clicks, add to carts, purchases per campaign
//        env META_ADS_TOKEN (ads_read), META_AD_ACCOUNT_ID (digits, without "act_")
//   3. Google Analytics 4 Data API (optional): visitor funnel + feature usage
//        env GA4_PROPERTY_ID; uses GOOGLE_SERVICE_ACCOUNT (add its email as a Viewer in GA4)
//
// POST (x-admin-token) { days: 7 | 14 | 30, end?: "YYYY-MM-DD" }  → this period + previous period

const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

// Max ad cost per sale, matched by words in the campaign name.
const CAPS = [
    { match: /sock/i, cap: 500 },
    { match: /ankle|cuff/i, cap: 600 },
    { match: /mat/i, cap: 1000 },
];

const PRODUCT_NAMES = {
    "yoga-mat-5mm": "Mat", "ankle-weights-2lb": "Cuffs", "pilates-ball": "Ball", "pilates-ring": "Ring",
    "grip-socks": "Socks (single)", "grip-socks-trio": "Socks Trio", "yoga-belt": "Belt", "yoga-block": "Block",
    "capsule-1kg": "Dumbbells 1kg", "capsule-2kg": "Dumbbells 2kg",
};

// ── Dates (India time) ──────────────────────────────────────────────
function istDateStr(d) { return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); }
function addDays(ymd, n) { const d = new Date(ymd + "T12:00:00+05:30"); d.setDate(d.getDate() + n); return istDateStr(d); }
function range(endYmd, days) {
    const until = endYmd, since = addDays(endYmd, -(days - 1));
    return {
        since, until,
        fromIso: new Date(since + "T00:00:00+05:30").toISOString(),
        toIso: new Date(addDays(until, 1) + "T00:00:00+05:30").toISOString(),
    };
}

// ── 1. Supabase ─────────────────────────────────────────────────────
const SALE_STATUSES = ["paid", "cod_unpaid", "shipped", "delivered"];

async function storeStats(sb, r) {
    const [{ data: orders }, { data: sessions }, { data: bookings }, { data: reviews }, { data: shippedInRange }] = await Promise.all([
        sb.from("orders").select("id, status, payment_method, amount_paise, items, is_gift, discount_code, created_at, channel")
            .gte("created_at", r.fromIso).lt("created_at", r.toIso),
        sb.from("checkout_sessions").select("total, created_at, reminded_at, converted_at")
            .gte("created_at", r.fromIso).lt("created_at", r.toIso),
        sb.from("event_bookings").select("qty, amount_paise, status, created_at")
            .gte("created_at", r.fromIso).lt("created_at", r.toIso),
        sb.from("reviews").select("rating, approved, product, created_at")
            .gte("created_at", r.fromIso).lt("created_at", r.toIso),
        sb.from("orders").select("shipped_at, delivered_at, delivery_status, status")
            .gte("shipped_at", r.fromIso).lt("shipped_at", r.toIso),
    ]);

    const sales = (orders || []).filter(o => SALE_STATUSES.includes(o.status) && o.payment_method !== "creator_gift" && (o.channel || "retail") === "retail");
    const revenue = sales.reduce((n, o) => n + (o.amount_paise || 0) / 100, 0);
    const cod = sales.filter(o => o.payment_method === "cod");

    const products = {};
    sales.forEach(o => (o.items || []).forEach(i => {
        const key = PRODUCT_NAMES[i.product_id] || i.product_name || i.product_id;
        const qty = Number(i.quantity ?? i.qty ?? 1) || 1;
        const p = products[key] = products[key] || { units: 0, revenue: 0 };
        p.units += qty;
        p.revenue += ((Number(i.unit_paise) || 0) * qty) / 100;
    }));

    const s = sessions || [];
    const reminded = s.filter(x => x.reminded_at);
    const recovered = reminded.filter(x => x.converted_at && x.converted_at > x.reminded_at);

    const shp = shippedInRange || [];
    const deliveredDays = shp.filter(o => o.delivered_at && o.shipped_at)
        .map(o => (new Date(o.delivered_at) - new Date(o.shipped_at)) / 864e5);

    const bk = (bookings || []).filter(b => b.status === "confirmed");
    const rv = (reviews || []);

    return {
        orders: sales.length,
        revenue: Math.round(revenue),
        aov: sales.length ? Math.round(revenue / sales.length) : 0,
        cod_share: sales.length ? Math.round(cod.length / sales.length * 100) : 0,
        prepaid_orders: sales.length - cod.length,
        cod_orders: cod.length,
        gifts: sales.filter(o => o.is_gift).length,
        discount_orders: sales.filter(o => o.discount_code).length,
        products: Object.entries(products).map(([name, v]) => ({ name, units: v.units, revenue: Math.round(v.revenue) }))
            .sort((a, b) => b.revenue - a.revenue),
        checkouts_started: s.length,
        checkouts_converted: s.filter(x => x.converted_at).length,
        reminders_sent: reminded.length,
        carts_recovered: recovered.length,
        recovered_value: Math.round(recovered.reduce((n, x) => n + (x.total || 0), 0)),
        shipped: shp.length,
        delivered: shp.filter(o => o.delivered_at).length,
        avg_delivery_days: deliveredDays.length ? +(deliveredDays.reduce((a, b) => a + b, 0) / deliveredDays.length).toFixed(1) : null,
        returning: shp.filter(o => /rto|return/i.test(o.delivery_status || "")).length,
        event_bookings: bk.length,
        event_tickets: bk.reduce((n, b) => n + b.qty, 0),
        event_revenue: Math.round(bk.reduce((n, b) => n + b.amount_paise, 0) / 100),
        reviews_new: rv.length,
        reviews_approved: rv.filter(x => x.approved).length,
        reviews_avg: rv.length ? +(rv.reduce((n, x) => n + x.rating, 0) / rv.length).toFixed(1) : null,
    };
}

// ── 2. Meta ads ────────────────────────────────────────────────────
function action(list, types) {
    const hit = (list || []).find(a => types.includes(a.action_type));
    return hit ? Number(hit.value) || 0 : 0;
}

async function metaStats(r) {
    const token = process.env.META_ADS_TOKEN, acct = String(process.env.META_AD_ACCOUNT_ID || "").replace(/^act_/, "");
    if (!token || !acct) return { connected: false };
    const qs = new URLSearchParams({
        level: "campaign",
        fields: "campaign_name,spend,impressions,clicks,actions",
        time_range: JSON.stringify({ since: r.since, until: r.until }),
        limit: "50",
        access_token: token,
    });
    const res = await fetch(`https://graph.facebook.com/v21.0/act_${acct}/insights?${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { connected: true, error: (data.error && data.error.message) || "HTTP " + res.status };

    const campaigns = (data.data || []).map(c => {
        const spend = Number(c.spend) || 0;
        const purchases = action(c.actions, ["purchase", "offsite_conversion.fb_pixel_purchase", "omni_purchase"]);
        const atc = action(c.actions, ["add_to_cart", "offsite_conversion.fb_pixel_add_to_cart", "omni_add_to_cart"]);
        const capRule = CAPS.find(x => x.match.test(c.campaign_name || ""));
        return {
            name: c.campaign_name,
            spend: Math.round(spend),
            impressions: Number(c.impressions) || 0,
            clicks: Number(c.clicks) || 0,
            add_to_carts: atc,
            purchases,
            cost_per_purchase: purchases ? Math.round(spend / purchases) : null,
            cap: capRule ? capRule.cap : null,
        };
    }).sort((a, b) => b.spend - a.spend);

    return {
        connected: true,
        spend: campaigns.reduce((n, c) => n + c.spend, 0),
        clicks: campaigns.reduce((n, c) => n + c.clicks, 0),
        purchases: campaigns.reduce((n, c) => n + c.purchases, 0),
        campaigns,
    };
}

// ── 3. Google Analytics 4 ──────────────────────────────────────────
const FUNNEL = ["view_item", "add_to_cart", "begin_checkout", "purchase"];
const FEATURES = ["select_promotion", "select_payment", "gift_selected", "cart_restored", "sign_up"];

async function gaStats(r) {
    const prop = process.env.GA4_PROPERTY_ID;
    if (!prop || !process.env.GOOGLE_SERVICE_ACCOUNT) return { connected: false };
    try {
        const { google } = require("googleapis");
        const cred = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        const auth = new google.auth.JWT(cred.client_email, null, cred.private_key, ["https://www.googleapis.com/auth/analytics.readonly"]);
        const ga = google.analyticsdata({ version: "v1beta", auth });
        const dateRanges = [{ startDate: r.since, endDate: r.until }];

        const [totals, events, channels] = await Promise.all([
            ga.properties.runReport({ property: `properties/${prop}`, requestBody: { dateRanges, metrics: [{ name: "sessions" }, { name: "totalUsers" }] } }),
            ga.properties.runReport({ property: `properties/${prop}`, requestBody: {
                dateRanges, dimensions: [{ name: "eventName" }], metrics: [{ name: "eventCount" }, { name: "totalUsers" }],
                dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...FUNNEL, ...FEATURES] } } },
            } }),
            ga.properties.runReport({ property: `properties/${prop}`, requestBody: {
                dateRanges, dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }],
                orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 6,
            } }),
        ]);
        const t = (totals.data.rows || [])[0];
        const ev = {};
        (events.data.rows || []).forEach(row => {
            ev[row.dimensionValues[0].value] = { count: Number(row.metricValues[0].value) || 0, users: Number(row.metricValues[1].value) || 0 };
        });
        return {
            connected: true,
            sessions: t ? Number(t.metricValues[0].value) || 0 : 0,
            users: t ? Number(t.metricValues[1].value) || 0 : 0,
            funnel: FUNNEL.map(name => ({ name, users: (ev[name] || {}).users || 0, count: (ev[name] || {}).count || 0 })),
            features: FEATURES.map(name => ({ name, count: (ev[name] || {}).count || 0 })),
            channels: (channels.data.rows || []).map(row => ({ name: row.dimensionValues[0].value, sessions: Number(row.metricValues[0].value) || 0 })),
        };
    } catch (err) {
        return { connected: true, error: err.message };
    }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!verifyAdminToken(getTokenFromEvent(event))) return json(401, { error: "Unauthorized" });

    const body = JSON.parse(event.body || "{}");
    const days = [7, 14, 30].includes(Number(body.days)) ? Number(body.days) : 7;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(body.end || "") ? body.end : istDateStr(new Date());
    const cur = range(end, days), prev = range(addDays(cur.since, -1), days);

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    try {
        const [store, storePrev, meta, metaPrev, ga, gaPrev] = await Promise.all([
            storeStats(sb, cur), storeStats(sb, prev),
            metaStats(cur).catch(e => ({ connected: true, error: e.message })),
            metaStats(prev).catch(() => ({ connected: false })),
            gaStats(cur), gaStats(prev),
        ]);
        return json(200, {
            period: { since: cur.since, until: cur.until, days },
            previous: { since: prev.since, until: prev.until },
            store, storePrev, meta, metaPrev, ga, gaPrev,
        });
    } catch (err) {
        console.error("admin-results:", err);
        return json(500, { error: err.message });
    }
};

exports._test = { range, addDays, storeStats, metaStats, action };
