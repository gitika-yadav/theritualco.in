// netlify/functions/event-reminders.js
// "See you tomorrow" email to everyone booked, about a day before each event.
// Triggered by cron-job.org every hour:
//   GET /.netlify/functions/event-reminders?secret=<CART_REMINDER_SECRET>   (&dry=1 to preview)

const { createClient } = require("@supabase/supabase-js");
const { reminderEmail, sendEmail, json } = require("./shared/events");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Send when the event is 12–30 hours away (≈ the evening before for a morning class).
const FROM_HOURS = 12, TO_HOURS = 30;

exports.handler = async (event) => {
    const q = event.queryStringParameters || {};
    const secret = process.env.EVENT_REMINDER_SECRET || process.env.CART_REMINDER_SECRET || process.env.BRIEFING_SECRET;
    if (!secret || q.secret !== secret) return { statusCode: 401, body: "Unauthorised" };
    const dry = q.dry === "1";

    try {
        const now = Date.now();
        const { data: events, error } = await supabase.from("events").select("*")
            .eq("status", "published")
            .gte("starts_at", new Date(now + FROM_HOURS * 3600e3).toISOString())
            .lte("starts_at", new Date(now + TO_HOURS * 3600e3).toISOString());
        if (error) throw error;

        const report = { events: [], sent: 0 };
        for (const ev of events || []) {
            const { data: list } = await supabase.from("event_bookings").select("*")
                .eq("event_id", ev.id).eq("status", "confirmed").is("reminded_at", null);
            let n = 0;
            for (const b of list || []) {
                if (!dry) {
                    try {
                        await sendEmail(b.email, `Tomorrow: ${ev.title} ✦ The Ritual Co.`, reminderEmail(ev, b));
                        await supabase.from("event_bookings").update({ reminded_at: new Date().toISOString() }).eq("id", b.id);
                    } catch (e) { console.error("[EVENT_REMINDER]", b.email, e.message); continue; }
                }
                n++;
            }
            report.events.push({ slug: ev.slug, reminders: n });
            report.sent += n;
        }
        return json(200, { dry, ...report });
    } catch (err) {
        console.error("event-reminders:", err);
        return json(500, { error: err.message });
    }
};
