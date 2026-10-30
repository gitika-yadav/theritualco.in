// netlify/functions/events-admin.js
// Admin API for admin/events.html (x-admin-token required).
//   { action:"list" }                                  → all events + ticket counts
//   { action:"save", event:{...} }                     → create / update an event
//   { action:"bookings", event_id }                    → guest list
//   { action:"add_guest", event_id, name, email, ... } → add someone yourself (e.g. a creator)
//   { action:"checkin", booking_id, undo? }
//   { action:"cancel", booking_id, refund?, force? }   → cancel; paid bookings refunded
//                                                        if 48h+ before start (force overrides)

const crypto = require("crypto");
const Razorpay = require("razorpay");
const { createClient } = require("@supabase/supabase-js");
const { verifyAdminToken, getTokenFromEvent } = require("./shared/verify-admin-token");
const { REFUND_HOURS, confirmationEmail, cancellationEmail, sendEmail, json } = require("./shared/events");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(title, startsAt) {
    const d = new Date(startsAt);
    const day = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).toLowerCase().replace(/\s+/g, "-");
    return (String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) + "-" + day).replace(/-+/g, "-");
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    if (!verifyAdminToken(getTokenFromEvent(event))) return json(401, { error: "Unauthorized" });

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }

    try {
        switch (body.action) {
            case "list": return await list();
            case "save": return await save(body.event || {});
            case "bookings": return await bookings(body.event_id);
            case "add_guest": return await addGuest(body);
            case "checkin": return await checkin(body);
            case "cancel": return await cancel(body);
            default: return json(400, { error: "Unknown action" });
        }
    } catch (err) {
        console.error("events-admin:", err);
        return json(500, { error: err.message });
    }
};

async function list() {
    const { data: events, error } = await supabase.from("events").select("*").order("starts_at", { ascending: false });
    if (error) throw error;
    const { data: bk } = await supabase.from("event_bookings").select("event_id, qty, amount_paise, status, checked_in_at");
    const stats = {};
    (bk || []).forEach(b => {
        const s = stats[b.event_id] = stats[b.event_id] || { tickets: 0, revenue: 0, checked_in: 0 };
        if (b.status === "confirmed") {
            s.tickets += b.qty;
            s.revenue += b.amount_paise / 100;
            if (b.checked_in_at) s.checked_in += b.qty;
        }
    });
    return json(200, { events: (events || []).map(e => ({ ...e, stats: stats[e.id] || { tickets: 0, revenue: 0, checked_in: 0 } })) });
}

async function save(e) {
    const title = str(e.title, 120);
    if (!title) return json(400, { error: "Title is required" });
    if (!e.starts_at || isNaN(new Date(e.starts_at))) return json(400, { error: "Start date/time is required" });

    const access = e.access === "invite" ? "invite" : "public";
    const row = {
        title,
        subtitle: str(e.subtitle, 200) || null,
        starts_at: new Date(e.starts_at).toISOString(),
        ends_at: e.ends_at && !isNaN(new Date(e.ends_at)) ? new Date(e.ends_at).toISOString() : null,
        venue_name: str(e.venue_name, 120) || null,
        venue_address: str(e.venue_address, 300) || null,
        map_url: /^https?:\/\//.test(e.map_url || "") ? str(e.map_url, 500) : null,
        price: Math.max(0, Math.round(Number(e.price) || 0)),
        capacity: Math.max(1, Math.round(Number(e.capacity) || 20)),
        max_per_booking: Math.min(10, Math.max(1, Math.round(Number(e.max_per_booking) || 4))),
        cover_image: str(e.cover_image, 500) || null,
        description: str(e.description, 5000) || null,
        includes: str(e.includes, 2000) || null,
        access,
        status: ["draft", "published", "cancelled"].includes(e.status) ? e.status : "draft",
        updated_at: new Date().toISOString(),
    };
    if (access === "invite") {
        row.invite_code = str(e.invite_code, 40) || crypto.randomBytes(4).toString("hex");
    }

    if (e.id) {
        const { data, error } = await supabase.from("events").update(row).eq("id", e.id).select("*").single();
        if (error) throw error;
        return json(200, { event: data });
    }

    let slug = str(e.slug, 80).toLowerCase().replace(/[^a-z0-9-]/g, "") || slugify(title, row.starts_at);
    const { data: clash } = await supabase.from("events").select("id").eq("slug", slug).maybeSingle();
    if (clash) slug = slug + "-" + crypto.randomBytes(2).toString("hex");
    const { data, error } = await supabase.from("events").insert({ ...row, slug }).select("*").single();
    if (error) throw error;
    return json(200, { event: data });
}

async function bookings(eventId) {
    const { data, error } = await supabase.from("event_bookings").select("*")
        .eq("event_id", eventId).neq("status", "pending").order("created_at", { ascending: true });
    if (error) throw error;
    return json(200, { bookings: data || [] });
}

async function addGuest(b) {
    const { data: ev } = await supabase.from("events").select("*").eq("id", b.event_id).single();
    if (!ev) return json(404, { error: "Event not found" });
    const name = str(b.name, 120), email = str(b.email, 200).toLowerCase();
    if (!name || !EMAIL_RE.test(email)) return json(400, { error: "Name and a valid email are required" });
    const { data: row, error } = await supabase.from("event_bookings").insert({
        event_id: ev.id, name, email,
        phone: str(b.phone, 20) || null,
        instagram: str(b.instagram, 60).replace(/^@/, "") || null,
        qty: Math.max(1, Math.round(Number(b.qty) || 1)),
        amount_paise: 0, status: "confirmed", source: "admin",
    }).select("*").single();
    if (error) throw error;
    if (b.notify !== false) {
        await sendEmail(row.email, `You're in: ${ev.title} ✦ The Ritual Co.`, confirmationEmail(ev, row))
            .catch(e => console.error("[EVENT_EMAIL]", e.message));
    }
    return json(200, { booking: row });
}

async function checkin(b) {
    const { data, error } = await supabase.from("event_bookings")
        .update({ checked_in_at: b.undo ? null : new Date().toISOString() })
        .eq("id", b.booking_id).select("*").single();
    if (error) throw error;
    return json(200, { booking: data });
}

async function cancel(b) {
    const { data: bk } = await supabase.from("event_bookings").select("*").eq("id", b.booking_id).single();
    if (!bk) return json(404, { error: "Booking not found" });
    if (bk.status !== "confirmed") return json(400, { error: `Booking is already ${bk.status}` });
    const { data: ev } = await supabase.from("events").select("*").eq("id", bk.event_id).single();

    let refunded = 0, refundId = null;
    if (bk.amount_paise > 0 && bk.razorpay_payment_id && b.refund !== false) {
        const hoursLeft = (new Date(ev.starts_at).getTime() - Date.now()) / 3600000;
        if (hoursLeft < REFUND_HOURS && !b.force) {
            return json(409, {
                error: `Less than ${REFUND_HOURS} hours to go (${Math.max(0, Math.floor(hoursLeft))}h), so it's outside the refund window.`,
                outside_window: true,
            });
        }
        const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
        const r = await razorpay.payments.refund(bk.razorpay_payment_id, {
            amount: bk.amount_paise,
            notes: { reason: "Event booking cancelled", event: ev.slug },
        });
        refunded = bk.amount_paise;
        refundId = r.id;
    }

    const { data, error } = await supabase.from("event_bookings")
        .update({ status: refunded ? "refunded" : "cancelled", refund_id: refundId, updated_at: new Date().toISOString() })
        .eq("id", bk.id).select("*").single();
    if (error) throw error;

    if (b.notify !== false) {
        await sendEmail(bk.email, `Booking cancelled: ${ev.title}`, cancellationEmail(ev, bk, refunded))
            .catch(e => console.error("[EVENT_EMAIL]", e.message));
    }
    return json(200, { booking: data, refunded: refunded / 100 });
}
