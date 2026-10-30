// netlify/functions/event-book.js
// Books spots at an event.
//   POST { action:"book", slug, name, email, phone, instagram?, qty, invite? }
//        free event → confirmed straight away + email
//        paid event → Razorpay order; spots held for 15 min until paid
//   POST { action:"verify", razorpay_order_id, razorpay_payment_id, razorpay_signature }
//        → confirms a paid booking + email
// No discount codes on tickets.

const Razorpay = require("razorpay");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { ticketsTaken, confirmationEmail, sendEmail, json } = require("./shared/events");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function confirmAndEmail(booking, ev) {
    try { await sendEmail(booking.email, `You're in: ${ev.title} ✦ The Ritual Co.`, confirmationEmail(ev, booking)); }
    catch (e) { console.error("[EVENT_EMAIL]", e.message); }
}

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
    let body;
    try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Bad request" }); }

    try {
        if (body.action === "verify") return await verify(body);
        if (body.action === "book") return await book(body);
        return json(400, { error: "Unknown action" });
    } catch (err) {
        console.error("event-book:", err);
        return json(500, { error: "Something went wrong. Please try again." });
    }
};

async function book(body) {
    const { data: ev } = await supabase.from("events").select("*")
        .eq("slug", str(body.slug, 120).toLowerCase()).eq("status", "published").maybeSingle();
    if (!ev) return json(404, { error: "This event isn't open for booking." });
    if (new Date(ev.starts_at).getTime() < Date.now()) return json(400, { error: "This event has already started." });

    if (ev.access === "invite") {
        const code = str(body.invite, 60).toLowerCase();
        if (!code || !ev.invite_code || code !== ev.invite_code.toLowerCase()) {
            return json(403, { error: "This event is invite-only. Please use the link from your invitation." });
        }
    }

    const name = str(body.name, 120);
    const email = str(body.email, 200).toLowerCase();
    const phone = str(body.phone, 20).replace(/[^\d+]/g, "");
    const instagram = str(body.instagram, 60).replace(/^@/, "") || null;
    const qty = Math.round(Number(body.qty) || 1);

    if (!name) return json(400, { error: "Please enter your name." });
    if (!EMAIL_RE.test(email)) return json(400, { error: "Please enter a valid email." });
    if (phone.replace(/\D/g, "").length < 10) return json(400, { error: "Please enter a valid phone number." });
    if (qty < 1 || qty > (ev.max_per_booking || 4)) return json(400, { error: `You can book up to ${ev.max_per_booking || 4} spots at a time.` });

    // Already booked with this email?
    const { data: mine } = await supabase.from("event_bookings").select("id, qty")
        .eq("event_id", ev.id).eq("status", "confirmed").ilike("email", email).limit(1);
    if (mine && mine.length) {
        return json(409, { error: "You're already booked for this event. Check your email for the confirmation, or reply to it if you need more spots." });
    }

    const left = ev.capacity - await ticketsTaken(supabase, ev.id);
    if (left < qty) {
        return json(409, { error: left > 0 ? `Only ${left} spot${left === 1 ? "" : "s"} left.` : "Sorry, this event is full." });
    }

    const base = {
        event_id: ev.id, name, email, phone, instagram, qty,
        source: ev.access === "invite" ? "invite" : "web",
    };

    // Free / RSVP
    if (!ev.price) {
        const { data: b, error } = await supabase.from("event_bookings")
            .insert({ ...base, amount_paise: 0, status: "confirmed" }).select("*").single();
        if (error) throw error;
        await confirmAndEmail(b, ev);
        return json(200, { status: "confirmed", booking_id: b.id });
    }

    // Paid
    const amount = ev.price * qty * 100;
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const rz = await razorpay.orders.create({
        amount, currency: "INR",
        receipt: ("EVT-" + ev.slug).slice(0, 40),
        notes: { type: "event", event: ev.slug, email },
    });
    const { data: b, error } = await supabase.from("event_bookings")
        .insert({ ...base, amount_paise: amount, status: "pending", razorpay_order_id: rz.id }).select("id").single();
    if (error) throw error;

    return json(200, {
        status: "pay",
        booking_id: b.id,
        key: process.env.RAZORPAY_KEY_ID,
        order_id: rz.id,
        amount,
        title: ev.title,
    });
}

async function verify(body) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return json(400, { error: "Missing payment details" });

    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
    if (expected !== razorpay_signature) return json(400, { error: "Payment could not be verified." });

    const { data: b } = await supabase.from("event_bookings").select("*").eq("razorpay_order_id", razorpay_order_id).maybeSingle();
    if (!b) return json(404, { error: "Booking not found. Please contact us with your payment ID." });
    if (b.status === "confirmed") return json(200, { status: "confirmed", booking_id: b.id });

    // Paid → always confirm (even if the 15-min hold lapsed; we'd rather squeeze one in than refuse a payment).
    const { data: updated, error } = await supabase.from("event_bookings")
        .update({ status: "confirmed", razorpay_payment_id, updated_at: new Date().toISOString() })
        .eq("id", b.id).select("*").single();
    if (error) throw error;

    const { data: ev } = await supabase.from("events").select("*").eq("id", b.event_id).single();
    await confirmAndEmail(updated, ev);
    return json(200, { status: "confirmed", booking_id: b.id });
}
