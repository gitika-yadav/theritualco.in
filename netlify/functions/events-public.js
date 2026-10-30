// netlify/functions/events-public.js
// Public read-only events API for /events and /events/<slug>.
//   GET                      → upcoming public events (invite-only ones hidden)
//   GET ?slug=xxx[&invite=]  → one event + spots left; invite-only events are
//                              only bookable with the matching invite code

const { createClient } = require("@supabase/supabase-js");
const { ticketsTaken, publicFields, json } = require("./shared/events");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
    const q = event.queryStringParameters || {};

    try {
        if (q.slug) {
            const { data: e } = await supabase.from("events").select("*")
                .eq("slug", String(q.slug).toLowerCase()).in("status", ["published", "cancelled"]).maybeSingle();
            if (!e) return json(404, { error: "Event not found" });

            const left = Math.max(0, e.capacity - await ticketsTaken(supabase, e.id));
            const past = new Date(e.starts_at).getTime() < Date.now();
            const invited = e.access !== "invite" ||
                (!!q.invite && !!e.invite_code && String(q.invite).trim().toLowerCase() === e.invite_code.toLowerCase());

            return json(200, {
                event: publicFields(e),
                spots_left: left,
                past,
                invited,
                bookable: e.status === "published" && !past && left > 0 && invited,
            });
        }

        const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
        const { data: list, error } = await supabase.from("events").select("*")
            .eq("status", "published").eq("access", "public")
            .gte("starts_at", since).order("starts_at", { ascending: true }).limit(24);
        if (error) throw error;

        const events = [];
        for (const e of list || []) {
            events.push({ ...publicFields(e), spots_left: Math.max(0, e.capacity - await ticketsTaken(supabase, e.id)) });
        }
        return json(200, { events }, { "Cache-Control": "public, max-age=30" });
    } catch (err) {
        console.error("events-public:", err);
        return json(500, { error: "Could not load events" });
    }
};
