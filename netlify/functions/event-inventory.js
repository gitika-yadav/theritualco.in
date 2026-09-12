// netlify/functions/event-inventory.js
// Backs admin/event-inventory.html. Actions:
//   GET  ?action=list                          -> { events: [...] }
//   POST { action:"add", ... }                 -> log stock going out
//   POST { action:"return", id, qty_returned, date_returned } -> log a return
// All actions require the same admin session token used by orders.html/compliance.html.

const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

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
        }

        return { statusCode: 400, body: JSON.stringify({ error: "Unknown or missing action" }) };
    } catch (err) {
        console.error("event-inventory function error:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function listEvents() {
    const { data, error } = await supabase
        .from("event_inventory")
        .select("*")
        .order("date_out", { ascending: false });
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ events: data }) };
}

async function addItem(body) {
    const { event_name, product_id, product_name, color, qty_leased, date_out, notes } = body;
    if (!event_name || !product_id || !color || !qty_leased) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
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
    const { id, qty_returned, date_returned } = body;
    if (!id || qty_returned === undefined) {
        return { statusCode: 400, body: JSON.stringify({ error: "id and qty_returned required" }) };
    }

    const { data: current, error: fetchErr } = await supabase
        .from("event_inventory")
        .select("qty_leased")
        .eq("id", id)
        .single();
    if (fetchErr) return { statusCode: 404, body: JSON.stringify({ error: "Record not found" }) };

    const qtyReturnedNum = parseInt(qty_returned, 10);
    const status = qtyReturnedNum >= current.qty_leased ? "returned" : "partial";

    const { data, error } = await supabase
        .from("event_inventory")
        .update({
            qty_returned: qtyReturnedNum,
            date_returned: date_returned || new Date().toISOString().slice(0, 10),
            status,
        })
        .eq("id", id)
        .select()
        .single();

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ item: data }) };
}