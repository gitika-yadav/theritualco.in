// netlify/functions/save-checkout.js
// Saves a shopper's checkout (email + cart) as soon as they type a valid email,
// so send-cart-reminders can email them once if they leave without ordering.
//
// POST { token, email, name?, phone?, items: [...] }   → upsert the session
// POST { token, converted: true }                      → order placed, never remind
// GET  ?token=xxx                                      → cart items, for the "Return to your cart" link
//
// Table: checkout_sessions (see supabase/migrations/*_checkout_sessions.sql)

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const TOKEN_RE = /^[a-zA-Z0-9-]{16,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (statusCode, body) => ({
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
});

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Keep only what the email and the restore link need.
function cleanItems(items) {
    if (!Array.isArray(items)) return [];
    return items.slice(0, 20).map(i => ({
        key:    str(i.key, 120),
        id:     str(i.id, 60),
        name:   str(i.name, 120),
        color:  str(i.color, 60),
        weight: str(i.weight, 30) || undefined,
        price:  Math.max(0, Math.round(Number(i.price) || 0)),
        qty:    Math.min(20, Math.max(1, Math.round(Number(i.qty) || 1))),
        image:  /^\/[\w\-./]+$/.test(i.image || "") ? i.image : "",
        sku:    str(i.sku, 60) || undefined,
    })).filter(i => i.id && i.name);
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "GET") {
            const token = event.queryStringParameters && event.queryStringParameters.token;
            if (!TOKEN_RE.test(token || "")) return json(400, { error: "Bad token" });
            const { data } = await supabase
                .from("checkout_sessions").select("items").eq("token", token).maybeSingle();
            if (!data) return json(404, { error: "Not found" });
            return json(200, { items: data.items || [] });
        }

        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        const body = JSON.parse(event.body || "{}");
        const token = body.token;
        if (!TOKEN_RE.test(token || "")) return json(400, { error: "Bad token" });

        if (body.converted) {
            await supabase.from("checkout_sessions")
                .update({ converted_at: new Date().toISOString() })
                .eq("token", token).is("converted_at", null);
            return json(200, { ok: true });
        }

        const email = str(body.email, 200).toLowerCase();
        const items = cleanItems(body.items);
        if (!EMAIL_RE.test(email) || !items.length) return json(400, { error: "Missing email or items" });

        const row = {
            token,
            email,
            name:  str(body.name, 120) || null,
            phone: str(body.phone, 20) || null,
            items,
            total: items.reduce((n, i) => n + i.price * i.qty, 0),
            updated_at: new Date().toISOString(),
        };

        // Don't reopen a session that already converted or was reminded.
        const { data: existing } = await supabase
            .from("checkout_sessions").select("converted_at, reminded_at").eq("token", token).maybeSingle();
        if (existing && (existing.converted_at || existing.reminded_at)) return json(200, { ok: true, skipped: true });

        const { error } = await supabase.from("checkout_sessions").upsert(row, { onConflict: "token" });
        if (error) throw error;
        return json(200, { ok: true });
    } catch (err) {
        console.error("save-checkout:", err);
        return json(500, { error: "Could not save" });
    }
};
