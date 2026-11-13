// netlify/functions/shared/event-reconcile.js
// Safety net for paid event bookings.
//
// A booking is normally confirmed when the guest's browser calls event-book "verify" after paying.
// With UPI on a phone the guest pays in their UPI app and often never returns to the page, so that
// call never happens: Razorpay shows "Captured" while the booking stays "pending".
//
// reconcilePending() asks Razorpay about every pending booking and confirms the paid ones.
// confirmPaid() is the single place a paid booking becomes confirmed (used here and by the webhook);
// it only acts on a booking that is still pending, so the guest never gets two confirmation emails.

const Razorpay = require("razorpay");
const { confirmationEmail, sendEmail } = require("./events");

const LOOKBACK_DAYS = 7;

async function confirmPaid(supabase, orderId, paymentId) {
    const { data: rows, error } = await supabase.from("event_bookings")
        .update({ status: "confirmed", razorpay_payment_id: paymentId, updated_at: new Date().toISOString() })
        .eq("razorpay_order_id", orderId).eq("status", "pending").select("*");
    if (error) throw error;
    const booking = rows && rows[0];
    if (!booking) return null; // not an event order, or already confirmed / cancelled

    const { data: ev } = await supabase.from("events").select("*").eq("id", booking.event_id).single();
    try { await sendEmail(booking.email, `You're in: ${ev.title} ✦ The Ritual Co.`, confirmationEmail(ev, booking)); }
    catch (e) { console.error("[EVENT_EMAIL]", e.message); }
    return booking;
}

async function reconcilePending(supabase, { eventId, dry } = {}) {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600e3).toISOString();
    let q = supabase.from("event_bookings").select("id, email, razorpay_order_id")
        .eq("status", "pending").not("razorpay_order_id", "is", null).gte("created_at", since);
    if (eventId) q = q.eq("event_id", eventId);
    const { data: pending, error } = await q;
    if (error) throw error;
    if (!pending || !pending.length) return { checked: 0, confirmed: [] };

    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    const confirmed = [];
    for (const b of pending) {
        try {
            const res = await razorpay.orders.fetchPayments(b.razorpay_order_id);
            const paid = (res.items || []).find(p => p.status === "captured");
            if (!paid) continue;
            if (dry) { confirmed.push({ email: b.email, payment_id: paid.id, dry: true }); continue; }
            const done = await confirmPaid(supabase, b.razorpay_order_id, paid.id);
            if (done) confirmed.push({ email: b.email, payment_id: paid.id });
        } catch (e) {
            console.error("[EVENT_RECONCILE]", b.razorpay_order_id, e.message || e);
        }
    }
    return { checked: pending.length, confirmed };
}

module.exports = { confirmPaid, reconcilePending };
