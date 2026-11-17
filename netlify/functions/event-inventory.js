// netlify/functions/event-inventory.js
// Backs admin/event-inventory.html. Actions:
//   GET  ?action=list                          -> { events: [...] }
//   POST { action:"add", ... }                 -> log stock going out
//   POST { action:"return", id, qty_returned, qty_damaged, qty_missing, date_returned, return_note }
//   POST { action:"return_batch", items:[{id, qty_returned, qty_damaged, qty_missing}], date_returned, return_note }
//        -> log returns for several products (e.g. a whole event) in one go
//   POST { action:"pool_move", product_id, product_name, color, qty, note }
//        -> add (+qty) or take out (-qty) opened stock from the event pool
// "add" draws from the event pool and is refused if the pool doesn't have enough.
// All actions require the same admin session token used by orders.html/compliance.html.

const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");
const { poolAvailable: poolAvailableFor } = require("./shared/event-pool");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);
const poolAvailable = (product_id, color) => poolAvailableFor(supabase, product_id, color);

exports.handler = async (event) => {
    const token = getTokenFromEvent(event);
    if (!verifyAdminToken(token)) {
        return { statusCode: 401, body: JSON.stringify({ error: "Unauthorised" }) };
    }

    try {
        const action = event.queryStringParameters?.action
            || (event.body ? JSON.parse(event.body).action : null);

        if (event.httpMethod === "GET" && action === "list") return await listEvents();

        if (event.httpMethod === "POST") {
            const body = JSON.parse(event.body || "{}");
            if (body.action === "list") return await listEvents();
            if (body.action === "add") return await addItem(body);
            if (body.action === "return") return await markReturn(body);
            if (body.action === "return_batch") return await markReturnBatch(body);
            if (body.action === "pool_move") return await poolMove(body);
        }

        return { statusCode: 400, body: JSON.stringify({ error: "Unknown or missing action" }) };
    } catch (err) {
        console.error("event-inventory function error:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function listEvents() {
    const [ev, pool] = await Promise.all([
        supabase.from("event_inventory").select("*").order("date_out", { ascending: false }),
        supabase.from("event_pool_moves").select("*").order("created_at", { ascending: false }),
    ]);
    if (ev.error) return { statusCode: 500, body: JSON.stringify({ error: ev.error.message }) };
    if (pool.error) return { statusCode: 500, body: JSON.stringify({ error: pool.error.message }) };
    return { statusCode: 200, body: JSON.stringify({ events: ev.data, pool_moves: pool.data }) };
}

async function poolMove(body) {
    const { product_id, product_name, color, note } = body;
    const qty = parseInt(body.qty, 10);
    if (!product_id || !color || !qty) {
        return { statusCode: 400, body: JSON.stringify({ error: "product, colour and a non-zero quantity are required" }) };
    }
    if (qty < 0) {
        const available = await poolAvailable(product_id, color);
        if (available + qty < 0) {
            return { statusCode: 400, body: JSON.stringify({ error: `Only ${Math.max(available, 0)} ${product_name || product_id} · ${color} in the pool right now` }) };
        }
    }
    const { data, error } = await supabase
        .from("event_pool_moves")
        .insert({ product_id, product_name: product_name || product_id, color, qty, note: (note || "").trim() || null })
        .select()
        .single();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ move: data }) };
}

async function addItem(body) {
    const { event_name, product_id, product_name, color, qty_leased, date_out, notes } = body;
    if (!event_name || !product_id || !color || !qty_leased) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
    }
    const available = await poolAvailable(product_id, color);
    if (parseInt(qty_leased, 10) > available) {
        return { statusCode: 400, body: JSON.stringify({ error: `${product_name || product_id} · ${color}: only ${Math.max(available, 0)} in the event pool — add more to the pool first` }) };
    }

    const { data, error } = await supabase
        .from("event_inventory")
        .insert({
            event_name,
            product_id,
            product_name: product_name || product_id,
            color,
            qty_leased: parseInt(qty_leased, 10),
            qty_returned: 0,
            date_out: date_out || new Date().toISOString().slice(0, 10),
            status: "out",
            notes: notes || null,
        })
        .select()
        .single();

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ item: data }) };
}

async function markReturn(body) {
    if (!body.id || body.qty_returned === undefined) {
        return { statusCode: 400, body: JSON.stringify({ error: "id and qty_returned required" }) };
    }
    const r = await applyReturn(body, body.date_returned, body.return_note);
    if (r.error) return { statusCode: r.status || 500, body: JSON.stringify({ error: r.error }) };
    return { statusCode: 200, body: JSON.stringify({ item: r.item }) };
}

async function markReturnBatch(body) {
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return { statusCode: 400, body: JSON.stringify({ error: "items required" }) };
    const saved = [];
    for (const it of items) {
        const r = await applyReturn(it, body.date_returned, body.return_note);
        if (r.error) {
            return { statusCode: r.status || 500, body: JSON.stringify({ error: r.error, saved: saved.map(x => x.id) }) };
        }
        saved.push(r.item);
    }
    return { statusCode: 200, body: JSON.stringify({ items: saved }) };
}

// Quantities are totals for the row (not increments): good back, damaged, missing.
async function applyReturn(it, date_returned, return_note) {
    const { data: current, error: fetchErr } = await supabase
        .from("event_inventory")
        .select("id, qty_leased, product_name, color")
        .eq("id", it.id)
        .single();
    if (fetchErr || !current) return { status: 404, error: "Record not found" };

    const n = (v) => Math.max(0, parseInt(v, 10) || 0);
    const qty_returned = n(it.qty_returned);
    const qty_damaged = n(it.qty_damaged);
    const qty_missing = n(it.qty_missing);
    const accounted = qty_returned + qty_damaged + qty_missing;
    if (accounted > current.qty_leased) {
        return { status: 400, error: `${current.product_name} · ${current.color}: ${accounted} counted but only ${current.qty_leased} went out` };
    }
    const status = accounted >= current.qty_leased ? "returned" : accounted > 0 ? "partial" : "out";

    const update = {
        qty_returned, qty_damaged, qty_missing, status,
        date_returned: date_returned || new Date().toISOString().slice(0, 10),
    };
    if (return_note !== undefined) update.return_note = (return_note || "").trim() || null;

    const { data, error } = await supabase
        .from("event_inventory")
        .update(update)
        .eq("id", it.id)
        .select()
        .single();
    if (error) return { error: error.message };
    return { item: data };
}
