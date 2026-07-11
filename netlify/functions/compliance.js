// netlify/functions/compliance.js
// Backs admin/compliance.html AND morning-briefing.js reads the same
// compliance_tasks table directly via Supabase REST (see morning-briefing.js).
//
// Actions (all via POST, JSON body with { action, ...payload }, except
// list-tasks/get-notes which also accept GET for convenience):
//   list-tasks              -> { tasks: [...] }
//   get-notes               -> { notes: "..." }
//   update-task             -> { task_key, done?, badge?, name?, note? } -> { task: {...} }
//   save-notes              -> { notes } -> { ok: true }
//
// All actions require a valid admin session token (Authorization: Bearer <token>),
// the same token issued by admin-auth.js.

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
        // Allow action via query string for GET, or body for POST
        const action = event.queryStringParameters?.action
            || (event.body ? JSON.parse(event.body).action : null);

        if (event.httpMethod === "GET" && action === "list-tasks") {
            return await listTasks();
        }
        if (event.httpMethod === "GET" && action === "get-notes") {
            return await getNotes();
        }

        if (event.httpMethod === "POST") {
            const body = JSON.parse(event.body || "{}");
            if (body.action === "list-tasks") return await listTasks();
            if (body.action === "get-notes") return await getNotes();
            if (body.action === "update-task") return await updateTask(body);
            if (body.action === "save-notes") return await saveNotes(body);
        }

        return { statusCode: 400, body: JSON.stringify({ error: "Unknown or missing action" }) };
    } catch (err) {
        console.error("compliance function error:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};

async function listTasks() {
    const { data, error } = await supabase
        .from("compliance_tasks")
        .select("*")
        .order("sort_order", { ascending: true });
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ tasks: data }) };
}

async function getNotes() {
    const { data, error } = await supabase
        .from("compliance_notes")
        .select("notes")
        .eq("id", 1)
        .single();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ notes: data?.notes || "" }) };
}

async function updateTask(body) {
    const { task_key, done, badge, name, note } = body;
    if (!task_key) {
        return { statusCode: 400, body: JSON.stringify({ error: "task_key required" }) };
    }

    // Fetch current row first — needed to append to the updates[] history
    // without clobbering existing entries.
    const { data: current, error: fetchErr } = await supabase
        .from("compliance_tasks")
        .select("updates")
        .eq("task_key", task_key)
        .single();
    if (fetchErr) return { statusCode: 404, body: JSON.stringify({ error: "Task not found" }) };

    const patch = { updated_at: new Date().toISOString() };
    if (typeof done === "boolean") patch.done = done;
    if (badge) patch.badge = badge;
    if (name) patch.name = name;
    if (note && note.trim()) {
        const updates = current.updates || [];
        updates.unshift({
            text: note.trim(),
            time: new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
        });
        patch.updates = updates;
    }

    const { data, error } = await supabase
        .from("compliance_tasks")
        .update(patch)
        .eq("task_key", task_key)
        .select()
        .single();
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    return { statusCode: 200, body: JSON.stringify({ task: data }) };
}

async function saveNotes(body) {
    const { notes } = body;
    const { error } = await supabase
        .from("compliance_notes")
        .update({ notes: notes || "", updated_at: new Date().toISOString() })
        .eq("id", 1);
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}