// netlify/functions/finance-agent.js
// The Ritual Co — Finance & Compliance Agent
//
// Autonomous agent with Claude API as reasoning brain.
// Called by orchestrator.js — never directly by cron.
//
// Capabilities:
//   - Analyses full financial + compliance state
//   - Decides what actions to take (not just what to report)
//   - Drafts CA instruction emails, GST reminders, escalations
//   - Tracks what it has actioned via agent_actions table
//   - Escalates ignored items day by day

const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "hello@theritualco.in";
const TO_EMAIL = "theritualcoofficial@gmail.com";

// ── COMPLIANCE STATE ──────────────────────────────────────────────────────────
const COMPLIANCE = [
    { id: "bank-account",  name: "Open current account — IORO Movement Pvt Ltd",   category: "Setup",    deadline: null,    done: false, penaltyPerDay: null },
    { id: "adt1",          name: "File ADT-1 (auditor appointment) on MCA",         category: "ROC",      deadline: null,    done: false, penaltyPerDay: 300 },
    { id: "gst-apply",     name: "Apply for GST registration",                       category: "GST",      deadline: null,    done: false, penaltyPerDay: null },
    { id: "razorpay-kyc",  name: "Migrate Razorpay to merchant account",             category: "Payments", deadline: null,    done: false, penaltyPerDay: null },
    { id: "board-meeting", name: "Hold & minute first board meeting",                category: "ROC",      deadline: null,    done: false, penaltyPerDay: null },
    { id: "dir3-gitika",   name: "DIR-3 KYC — Gitika Yadav (DIN 11470303)",         category: "ROC",      deadline: "09-30", done: false, penaltyPerDay: 5000 },
    { id: "dir3-saksham",  name: "DIR-3 KYC — Saksham Yadav (DIN 11470302)",        category: "ROC",      deadline: "09-30", done: false, penaltyPerDay: 5000 },
    { id: "agm",           name: "Hold Annual General Meeting",                      category: "ROC",      deadline: "09-30", done: false, penaltyPerDay: null },
    { id: "aoc4",          name: "File AOC-4 (Financial Statements)",                category: "ROC",      deadline: "10-30", done: false, penaltyPerDay: 200 },
    { id: "itr6",          name: "File ITR-6 (Company Income Tax Return)",           category: "Tax",      deadline: "10-31", done: false, penaltyPerDay: null },
    { id: "mgt7a",         name: "File MGT-7A (Annual Return)",                     category: "ROC",      deadline: "11-29", done: false, penaltyPerDay: 200 },
    { id: "gstr9",         name: "File GSTR-9 (Annual GST Return)",                 category: "GST",      deadline: "12-31", done: false, penaltyPerDay: null },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
function request(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => resolve({ status: res.statusCode, body: data }));
        });
        req.on("error", reject);
        if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
        req.end();
    });
}

function nowIST() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function daysUntil(mmdd) {
    if (!mmdd) return null;
    const now = nowIST();
    const [m, d] = mmdd.split("-").map(Number);
    let target = new Date(now.getFullYear(), m - 1, d);
    if (target < now) target.setFullYear(target.getFullYear() + 1);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function formatINR(n) {
    return "₹" + Number(n).toLocaleString("en-IN");
}

// ── SUPABASE ──────────────────────────────────────────────────────────────────
function supabaseReq(path, method, body, params) {
    method = method || "GET";
    params = params || "";
    const hostname = new URL(SUPABASE_URL).hostname;
    const payload = body ? JSON.stringify(body) : null;
    return request({
        hostname,
        path: "/rest/v1/" + path + params,
        method,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: "Bearer " + SUPABASE_KEY,
            "Content-Type": "application/json",
            "Prefer": method === "POST" ? "return=representation" : "",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
    }, payload);
}

async function getOrders() {
    const now = nowIST();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [allPaid, thisWeek, thisMonth, pending] = await Promise.all([
        supabaseReq("orders", "GET", null, "?status=eq.paid&select=id,total_amount,created_at"),
        supabaseReq("orders", "GET", null, "?status=eq.paid&created_at=gte." + weekAgo + "&select=id,total_amount"),
        supabaseReq("orders", "GET", null, "?status=eq.paid&created_at=gte." + monthStart + "&select=id,total_amount"),
        supabaseReq("orders", "GET", null, "?status=in.(paid,processing)&select=id,customer_name,created_at,total_amount,status"),
    ]);

    const parse = (r) => { try { const d = JSON.parse(r.body); return Array.isArray(d) ? d : []; } catch { return []; } };
    const sum = (arr) => (Array.isArray(arr) ? arr : []).reduce((t, o) => t + Number(o.total_amount || 0), 0);

    const allPaidData = parse(allPaid);
    const weekData = parse(thisWeek);
    const monthData = parse(thisMonth);
    const pendingData = parse(pending);

    return {
        allTime: { count: allPaidData.length, revenue: sum(allPaidData) },
        thisWeek: { count: weekData.length, revenue: sum(weekData) },
        thisMonth: { count: monthData.length, revenue: sum(monthData) },
        pending: pendingData,
        inventory: Math.max(0, 300 - allPaidData.length),
        earlyBirdRemaining: Math.max(0, 100 - allPaidData.length),
    };
}

async function getPreviousActions() {
    const res = await supabaseReq("agent_actions", "GET", null, "?agent=eq.finance&order=created_at.desc&limit=20");
    try { const d = JSON.parse(res.body); return Array.isArray(d) ? d : []; } catch { return []; }
}

async function logAction(fields) {
    const res = await supabaseReq("agent_actions", "POST", {
        agent: "finance",
        action_type: fields.action_type,
        title: fields.title,
        content: fields.content,
        status: fields.status || "pending",
        metadata: fields.metadata || {},
    });
    try { const d = JSON.parse(res.body); return Array.isArray(d) ? d[0] : null; } catch { return null; }
}

async function escalatePending() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await supabaseReq("agent_actions", "GET", null,
        "?agent=eq.finance&status=eq.pending&created_at=lte." + cutoff);
    let stale = [];
    try { const d = JSON.parse(res.body || "[]"); stale = Array.isArray(d) ? d : []; } catch {}
    for (const action of stale) {
        const newCount = (action.escalation_count || 0) + 1;
        await supabaseReq("agent_actions?id=eq." + action.id, "PATCH", {
            escalation_count: newCount,
            status: newCount >= 3 ? "escalated" : "pending",
        });
    }
    return stale.length;
}

// ── SEND EMAIL ────────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
    const payload = JSON.stringify({
        from: "The Ritual Co — Finance Agent <" + FROM_EMAIL + ">",
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
    });
    const res = await request({
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
            Authorization: "Bearer " + RESEND_KEY,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
        },
    }, payload);
    return res.status === 200 || res.status === 201;
}

// ── CLAUDE BRAIN ──────────────────────────────────────────────────────────────
async function think(systemPrompt, userMessage, maxTokens) {
    maxTokens = maxTokens || 2000;
    const payload = JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
    });

    const res = await request({
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
        },
    }, payload);

    const data = JSON.parse(res.body);
    if (res.status !== 200) throw new Error("Claude error: " + data.error?.message);
    return data.content[0].text;
}

const SYSTEM_PROMPT = `Finance & Compliance Agent for The Ritual Co / IORO Movement Pvt Ltd (Gitika Yadav, Google engineer, limited time).
Be extremely concise. Prioritise ruthlessly. Max 3 actions per response.

Return ONLY valid JSON, no other text:
{"summary":"1-2 sentences","actions":[{"id":"snake_id","type":"alert|report|draft_for_approval","priority":"critical|high|medium|low","title":"short title","content":"1-2 sentence description only","requiresApproval":true,"estimatedPenalty":null}],"insights":[],"nextCheckIn":"tomorrow"}

requiresApproval rules:
- true: anything Gitika must physically do (open account, file documents, call someone, pay something)
- true: any email to external party (CA, bank, MCA)
- false: ONLY pure internal reports with zero action required`;

// ── EMAIL TEMPLATE ────────────────────────────────────────────────────────────
function buildEmail(subject, decision, actions, isUrgent) {
    const headerBg = isUrgent ? "#5c1a1a" : "#1a1814";
    const today = nowIST().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const actionsHtml = actions.map(function(a) {
        const pColor = a.priority === "critical" ? "#8b2e2e" : a.priority === "high" ? "#8b5a2b" : "#3d6b52";
        const pBg = a.priority === "critical" ? "#FCEBEB" : a.priority === "high" ? "#FAEEDA" : "#EAF3DE";
        return '<div style="border:1px solid #ece8df;border-radius:8px;padding:16px;margin-bottom:12px">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
            '<strong style="font-size:14px;color:#1a1814">' + a.title + '</strong>' +
            '<span style="background:' + pBg + ';color:' + pColor + ';font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;margin-left:8px">' + (a.priority || "").toUpperCase() + '</span>' +
            '</div>' +
            (a.estimatedPenalty ? '<p style="margin:0 0 8px;font-size:12px;color:#8b2e2e">Penalty if delayed: ' + a.estimatedPenalty + '</p>' : '') +
            '<div style="background:#f5f2ed;border-radius:6px;padding:12px;font-size:13px;color:#1a1814;line-height:1.6;white-space:pre-wrap">' + (a.content || "") + '</div>' +
            (a.requiresApproval
                    ? '<div style="margin-top:10px"><a href="https://theritualco.in/admin/agents.html" style="background:#1a1814;color:#faf9f6;padding:6px 16px;border-radius:4px;font-size:12px;text-decoration:none;font-weight:500;margin-right:8px">Review on dashboard</a></div>'
                    : '<p style="margin:8px 0 0;font-size:11px;color:#3d6b52">Executed automatically</p>'
            ) +
            '</div>';
    }).join("");

    const insightsHtml = (decision.insights || []).map(function(i) {
        return '<p style="margin:0 0 6px;font-size:13px;color:#1a1814">' + i + '</p>';
    }).join("");

    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
        '<body style="margin:0;padding:0;background:#f5f2ed;font-family:-apple-system,sans-serif">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ed;padding:32px 16px"><tr><td align="center">' +
        '<table width="560" cellpadding="0" cellspacing="0" style="background:#faf9f6;border-radius:12px;overflow:hidden;max-width:100%">' +

        '<tr><td style="background:' + headerBg + ';padding:28px 32px">' +
        '<p style="margin:0 0 6px;font-size:10px;letter-spacing:0.15em;color:#c8b8a2;text-transform:uppercase">Finance & Compliance · The Ritual Co</p>' +
        '<h1 style="margin:0;font-size:20px;color:#faf9f6;font-weight:400">' + subject + '</h1>' +
        '<p style="margin:6px 0 0;font-size:12px;color:#a09890">' + today + '</p></td></tr>' +

        '<tr><td style="padding:24px 32px 0"><p style="margin:0;font-size:14px;color:#1a1814;line-height:1.6">' + decision.summary + '</p></td></tr>' +

        '<tr><td style="padding:20px 32px 0">' +
        '<h2 style="font-size:12px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px">Actions</h2>' +
        actionsHtml + '</td></tr>' +

        (insightsHtml ? '<tr><td style="padding:20px 32px 0"><h2 style="font-size:12px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px">Insights</h2>' + insightsHtml + '</td></tr>' : '') +

        '<tr><td style="padding:20px 32px"><p style="margin:0;font-size:12px;color:#6b6660"><a href="https://theritualco.in/admin/agents.html" style="color:#1a1814;font-weight:500">Open agent dashboard</a></p></td></tr>' +

        '<tr><td style="padding:16px 32px;border-top:1px solid #ece8df"><p style="margin:0;font-size:11px;color:#a09890;text-align:center">IORO Movement Private Limited · Next check-in: ' + (decision.nextCheckIn || "tomorrow") + '</p></td></tr>' +

        '</table></td></tr></table></body></html>';
}

// ── MORNING BRIEFING ──────────────────────────────────────────────────────────
async function morningBriefing() {
    const [orders, previousActions] = await Promise.all([getOrders(), getPreviousActions()]);
    const escalated = await escalatePending();

    const complianceSnapshot = COMPLIANCE.filter(function(t) { return !t.done; }).map(function(t) {
        return {
            id: t.id,
            name: t.name,
            category: t.category,
            daysLeft: daysUntil(t.deadline),
            deadline: t.deadline || "IMMEDIATE",
            penaltyExposure: t.penaltyPerDay ? formatINR(t.penaltyPerDay * 30) + " if delayed 30 days" : "none",
        };
    });

    const pendingApprovals = previousActions.filter(function(a) { return a.status === "pending"; });
    const escalations = previousActions.filter(function(a) { return a.status === "escalated"; });

    const dataContext = [
        "FINANCIAL STATE:",
        "All-time: " + formatINR(orders.allTime.revenue) + " / " + orders.allTime.count + " orders",
        "This week: " + formatINR(orders.thisWeek.revenue) + " / " + orders.thisWeek.count + " orders",
        "This month: " + formatINR(orders.thisMonth.revenue) + " / " + orders.thisMonth.count + " orders",
        "Inventory: " + orders.inventory + " sets remaining of 300",
        "Early bird slots left: " + orders.earlyBirdRemaining + " of 100",
        "Pending/unshipped: " + orders.pending.length,
        "",
        "COMPLIANCE (" + complianceSnapshot.length + " open items):",
        complianceSnapshot.map(function(t) {
            return "- [" + t.id + "] " + t.name + " | Deadline: " + t.deadline + " | Days: " + (t.daysLeft != null ? t.daysLeft : "DO NOW") + " | Penalty: " + t.penaltyExposure;
        }).join("\n"),
        "",
        "PENDING APPROVALS (" + pendingApprovals.length + "):",
        pendingApprovals.map(function(a) { return "- " + a.title + " (escalations: " + a.escalation_count + ")"; }).join("\n") || "None",
        "",
        "ESCALATED / IGNORED (" + escalations.length + "):",
        escalations.map(function(a) { return "- " + a.title + " — ignored " + a.escalation_count + " days"; }).join("\n") || "None",
        "",
        "TODAY: " + nowIST().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        "DAY OF MONTH: " + nowIST().getDate(),
        "IS MONDAY: " + (nowIST().getDay() === 1),
    ].join("\n");

    const raw = await think(SYSTEM_PROMPT,
        "Analyse The Ritual Co's financial and compliance state. Be extremely concise. Max 3 actions. No long drafts in content field — just 1-2 sentences per action.\n\n" + dataContext,
        800);

    let decision;
    try { decision = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch { decision = { summary: raw.slice(0, 400), actions: [], insights: [], nextCheckIn: "tomorrow" }; }

    const finalActions = [];
    for (const action of (decision.actions || [])) {
        const logged = await logAction({
            action_type: action.type,
            title: action.title,
            content: action.content,
            status: action.requiresApproval ? "pending" : "executed",
            metadata: { priority: action.priority, recipient: action.recipient, subject: action.subject, estimatedPenalty: action.estimatedPenalty },
        });
        if (logged) action.id = logged.id;
        finalActions.push(action);
    }

    const hasCritical = finalActions.some(function(a) { return a.priority === "critical"; });
    const subject = (hasCritical || escalations.length > 0 ? "⚠️ Critical" : "📊 Finance update") +
        " — " + nowIST().toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    await sendEmail(TO_EMAIL, subject, buildEmail(subject, decision, finalActions, hasCritical));

    return { ok: true, actionsCount: finalActions.length, escalated };
}

// ── HANDLE TASK ───────────────────────────────────────────────────────────────
async function handleTask(context) {
    const orders = await getOrders();

    const dataContext = "SNAPSHOT:\nRevenue: " + formatINR(orders.allTime.revenue) + " / " + orders.allTime.count + " orders\n" +
        "This week: " + formatINR(orders.thisWeek.revenue) + "\nInventory: " + orders.inventory + " sets\n" +
        "Pending: " + orders.pending.length + " orders\n" +
        "Compliance open: " + COMPLIANCE.filter(function(t) { return !t.done; }).length + " items\n\n" +
        "USER: \"" + (context.message || "") + "\"\nINTENT: " + (context.intent || "") + "\nURGENCY: " + (context.urgency || "medium");

    const raw = await think(SYSTEM_PROMPT,
        "Gitika has asked you something. Respond directly and concisely. Max 2 actions.\n\n" + dataContext,
        800);

    let decision;
    try { decision = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch { decision = { summary: raw, actions: [{ type: "report", title: "Response", content: raw, requiresApproval: false, priority: "medium" }], insights: [] }; }

    for (const action of (decision.actions || [])) {
        await logAction({
            action_type: action.type,
            title: action.title,
            content: action.content,
            status: action.requiresApproval ? "pending" : "executed",
            metadata: { priority: action.priority },
        });
    }

    const subject = "Finance: " + (context.intent || context.message || "response").slice(0, 60);
    await sendEmail(TO_EMAIL, subject, buildEmail(subject, decision, decision.actions || [], false));

    return { ok: true, response: decision.summary, actions: decision.actions, requiresApproval: (decision.actions || []).some(function(a) { return a.requiresApproval; }) };
}

// ── EXECUTE APPROVED ──────────────────────────────────────────────────────────
async function executeApproved(context) {
    const action = context.action;
    if (!action) return { ok: false, error: "No action data" };

    if (action.action_type === "send_email" && action.metadata && action.metadata.recipient) {
        await sendEmail(action.metadata.recipient, action.metadata.subject || action.title,
            '<div style="font-family:sans-serif;font-size:14px;white-space:pre-wrap;line-height:1.6">' + action.content + '</div>');
    }

    await supabaseReq("agent_actions?id=eq." + context.actionId, "PATCH",
        { status: "executed", actioned_at: new Date().toISOString() });

    await sendEmail(TO_EMAIL, "Executed: " + action.title,
        '<p style="font-family:sans-serif;font-size:14px"><strong>' + action.title + '</strong> has been executed by the finance agent.</p>');

    return { ok: true };
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
exports.handler = async function(event) {
    const headers = { "Content-Type": "application/json" };

    const internalSecret = event.headers && event.headers["x-orchestrator-secret"];
    const briefingSecret = process.env.BRIEFING_SECRET;

    if (briefingSecret) {
        const isDirectCron = event.httpMethod === "GET" && event.queryStringParameters && event.queryStringParameters.secret === briefingSecret;
        const isOrchestrator = internalSecret === briefingSecret;
        if (!isDirectCron && !isOrchestrator) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorised" }) };
        }
    }

    try {
        var body = {};
        if (event.httpMethod === "POST") {
            try { body = JSON.parse(event.body || "{}"); } catch {}
        }

        const task = body.task || "morning_briefing";

        if (task === "morning_briefing") return { statusCode: 200, headers, body: JSON.stringify(await morningBriefing()) };
        if (task === "task") return { statusCode: 200, headers, body: JSON.stringify(await handleTask(body.context || {})) };
        if (task === "execute_approved") return { statusCode: 200, headers, body: JSON.stringify(await executeApproved(body.context || {})) };

        return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown task" }) };
    } catch (err) {
        console.error("Finance agent error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};