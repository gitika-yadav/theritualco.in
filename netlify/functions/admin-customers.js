// netlify/functions/admin-customers.js
// Backs admin/customers.html: repeat purchase rate and lifetime value.
//
// POST (x-admin-token) → { summary, cohorts, firstProduct, crossover, customers }
//
// A "customer" is one person across website orders and event bookings, matched
// by phone (last 10 digits) or email, so someone who used a different email but
// the same phone is still one customer.
// Counts as a purchase:
//   - retail website orders that were paid or are on their way
//     (paid, cod_unpaid, shipped, delivered). RTO / returned / pending don't count.
//     Creator gifts, event-stock shipments and wholesale are left out.
//   - confirmed event bookings.

const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

const SALE_STATUSES = ["paid", "cod_unpaid", "shipped", "delivered"];
const PRODUCT_NAMES = {
    "yoga-mat-5mm": "Mat", "ankle-weights-2lb": "Cuffs", "pilates-ball": "Ball", "pilates-ring": "Ring",
    "grip-socks": "Socks", "grip-socks-trio": "Socks Trio", "yoga-belt": "Belt", "yoga-block": "Block",
    "capsule-1kg": "Dumbbells", "capsule-2kg": "Dumbbells",
};
const DAY = 86400000;

const phoneKey = p => { const d = String(p || "").replace(/\D/g, ""); return d.length >= 10 ? "p:" + d.slice(-10) : null; };
const emailKey = e => { const s = String(e || "").trim().toLowerCase(); return s.includes("@") ? "e:" + s : null; };
const monthOf = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 7);

function itemLabel(i) {
    if (i.is_kit) return i.product_name || "Kit";
    return PRODUCT_NAMES[i.product_id] || i.product_name || i.product_id || "Item";
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!verifyAdminToken(getTokenFromEvent(event))) return json(401, { error: "Unauthorised" });

    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const [o, b] = await Promise.all([
        sb.from("orders").select("id, status, payment_method, channel, amount_paise, items, created_at, guest_name, guest_email, guest_phone")
            .in("status", SALE_STATUSES),
        sb.from("event_bookings").select("id, event_id, name, email, phone, qty, amount_paise, status, created_at")
            .eq("status", "confirmed"),
    ]);
    if (o.error) return json(500, { error: o.error.message });
    if (b.error) return json(500, { error: b.error.message });

    const { data: events } = await sb.from("events").select("id, title");
    const eventTitle = Object.fromEntries((events || []).map(e => [e.id, e.title]));

    // One list of purchases
    const purchases = [];
    (o.data || []).forEach(r => {
        if (r.payment_method === "creator_gift" || r.payment_method === "event_stock") return;
        if ((r.channel || "retail") !== "retail") return;
        purchases.push({
            kind: "order", id: r.id, at: r.created_at, amount: (r.amount_paise || 0) / 100,
            name: r.guest_name, email: r.guest_email, phone: r.guest_phone, status: r.status,
            what: [...new Set((r.items || []).map(itemLabel))].join(", "),
            first: (r.items || [])[0] ? itemLabel(r.items[0]) : "—",
        });
    });
    (b.data || []).forEach(r => purchases.push({
        kind: "event", id: r.id, at: r.created_at, amount: (r.amount_paise || 0) / 100,
        name: r.name, email: r.email, phone: r.phone, what: eventTitle[r.event_id] || "Event",
    }));
    purchases.sort((x, y) => new Date(x.at) - new Date(y.at));

    // Group into customers: union purchases that share a phone or an email
    const parent = {};
    const find = k => (parent[k] === k ? k : (parent[k] = find(parent[k])));
    const union = (a, c) => { parent[a] ??= a; parent[c] ??= c; parent[find(a)] = find(c); };
    purchases.forEach((p, i) => {
        const self = "x:" + i; parent[self] ??= self;
        [phoneKey(p.phone), emailKey(p.email)].filter(Boolean).forEach(k => union(self, k));
    });
    const groups = {};
    purchases.forEach((p, i) => { const root = find("x:" + i); (groups[root] ||= []).push(p); });

    const customers = Object.values(groups).map(list => {
        const orders = list.filter(p => p.kind === "order");
        const evs = list.filter(p => p.kind === "event");
        const last = list[list.length - 1];
        const named = [...list].reverse().find(p => p.name) || {};
        const contact = [...list].reverse().find(p => p.phone) || {};
        const mail = [...list].reverse().find(p => p.email) || {};
        return {
            name: named.name || "—", phone: contact.phone || "", email: mail.email || "",
            orders: orders.length, events: evs.length, purchases: list.length,
            productSpend: orders.reduce((n, p) => n + p.amount, 0),
            eventSpend: evs.reduce((n, p) => n + p.amount, 0),
            first: list[0].at, last: last.at,
            firstKind: list[0].kind, firstProduct: orders[0] ? orders[0].first : null,
            secondAt: list[1] ? list[1].at : null,
            secondOrderAt: orders[1] ? orders[1].at : null,
            history: list.map(p => ({ kind: p.kind, at: p.at, amount: p.amount, what: p.what })),
        };
    });
    customers.forEach(c => { c.spend = c.productSpend + c.eventSpend; });
    customers.sort((x, y) => y.spend - x.spend);

    // Summary
    const buyers = customers.filter(c => c.orders > 0);
    const repeatBuyers = buyers.filter(c => c.orders >= 2);
    const cameBack = customers.filter(c => c.purchases >= 2);
    const productRevenue = buyers.reduce((n, c) => n + c.productSpend, 0);
    const totalRevenue = customers.reduce((n, c) => n + c.spend, 0);
    const repeatRevenue = cameBack.reduce((n, c) => n + c.history.slice(1).reduce((s, h) => s + h.amount, 0), 0);
    const gaps = cameBack.map(c => (new Date(c.secondAt) - new Date(c.first)) / DAY).sort((a, z) => a - z);
    const median = gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : null;
    const now = Date.now();

    const summary = {
        customers: customers.length,
        buyers: buyers.length,
        repeatBuyers: repeatBuyers.length,
        cameBack: cameBack.length,
        ordersPerBuyer: buyers.length ? buyers.reduce((n, c) => n + c.orders, 0) / buyers.length : 0,
        productLtv: buyers.length ? productRevenue / buyers.length : 0,
        ltv: customers.length ? totalRevenue / customers.length : 0,
        repeatRevenue, totalRevenue,
        medianDaysToSecond: median,
        firstPurchase: purchases[0] ? purchases[0].at : null,
        // How long customers have had to come back: under 30 days is too early to judge
        matured30: customers.filter(c => now - new Date(c.first) >= 30 * DAY).length,
        cameBack30: customers.filter(c => now - new Date(c.first) >= 30 * DAY && c.secondAt && new Date(c.secondAt) - new Date(c.first) <= 30 * DAY).length,
    };

    // Cohorts by month of first purchase
    const cohortMap = {};
    customers.forEach(c => {
        const m = monthOf(c.first);
        const g = (cohortMap[m] ||= { month: m, customers: 0, cameBack: 0, spend: 0, orders: 0 });
        g.customers++; g.spend += c.spend; g.orders += c.purchases;
        if (c.purchases >= 2) g.cameBack++;
    });
    const cohorts = Object.values(cohortMap).sort((a, z) => a.month.localeCompare(z.month));

    // First product bought → came back?
    const fp = {};
    buyers.forEach(c => {
        const k = c.firstKind === "event" ? "Event first, then shop" : (c.firstProduct || "—");
        const g = (fp[k] ||= { first: k, customers: 0, cameBack: 0, spend: 0 });
        g.customers++; g.spend += c.spend; if (c.purchases >= 2) g.cameBack++;
    });
    const firstProduct = Object.values(fp).sort((a, z) => z.customers - a.customers);

    // Events ↔ shop
    const attendees = customers.filter(c => c.events > 0);
    const crossover = {
        attendees: attendees.length,
        alsoBought: attendees.filter(c => c.orders > 0).length,
        boughtAfterEvent: attendees.filter(c => c.orders > 0 && c.firstKind === "event").length,
        buyersWhoCameToEvent: buyers.filter(c => c.events > 0 && c.firstKind === "order").length,
    };

    return json(200, { summary, cohorts, firstProduct, crossover, customers });
};
