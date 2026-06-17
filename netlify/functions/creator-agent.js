// netlify/functions/creator-agent.js
// The Ritual Co — Creator & Partnerships Agent
//
// Autonomous agent with Claude API as reasoning brain.
// Called by orchestrator.js
//
// Capabilities:
//   - Tracks all 8 shortlisted creators via Supabase
//   - Monitors posting deadlines, follow-up timing
//   - Drafts personalised outreach DMs and emails
//   - Drafts follow-up messages for overdue creators
//   - Generates creator briefs with discount codes
//   - Escalates ignored creators daily
//   - Morning briefing: who to contact, who to follow up, who is overdue

const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = "hello@theritualco.in";
const TO_EMAIL = "theritualcoofficial@gmail.com";

// ── BRAND CONTEXT ─────────────────────────────────────────────────────────────
const BRAND = {
    name: "The Ritual Co",
    handle: "@theritualco.in",
    positioning: "Pilates on a yacht — aspirational, restrained luxury. Products are lifestyle objects not gym equipment.",
    product: "Silicone Capsule Dumbbells — cast iron core, silicone coating. Available in Peach, Grey, Cream, Black.",
    contentRequirements: "Dedicated reel (not story, not collab post), unique discount code in caption, post within 14 days of receiving product, tag @theritualco.in",
    tone: "Premium, editorial, aspirational. Never discount-forward. Never 'gym bro'. Always aesthetic-first.",
};

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

function daysSince(isoDate) {
    if (!isoDate) return null;
    return Math.floor((nowIST() - new Date(isoDate)) / (1000 * 60 * 60 * 24));
}

function daysUntil(isoDate) {
    if (!isoDate) return null;
    return Math.ceil((new Date(isoDate) - nowIST()) / (1000 * 60 * 60 * 24));
}

function generateDiscountCode(handle) {
    const clean = handle.replace(/[@._\-]/g, "").toUpperCase().slice(0, 8);
    return "RITUAL" + clean;
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

async function getCreators() {
    const res = await supabaseReq("creators", "GET", null, "?order=follower_count.desc");
    try { const d = JSON.parse(res.body); return Array.isArray(d) ? d : []; } catch { return []; }
}

async function updateCreator(id, fields) {
    return supabaseReq("creators?id=eq." + id, "PATCH", fields);
}

async function getPreviousActions() {
    const res = await supabaseReq("agent_actions", "GET", null, "?agent=eq.creator&order=created_at.desc&limit=30");
    try { const d = JSON.parse(res.body); return Array.isArray(d) ? d : []; } catch { return []; }
}

async function logAction(fields) {
    const res = await supabaseReq("agent_actions", "POST", {
        agent: "creator",
        action_type: fields.action_type,
        title: fields.title,
        content: fields.content,
        status: fields.status || "pending",
        metadata: fields.metadata || {},
    });
    try { const d = JSON.parse(res.body); return Array.isArray(d) ? d[0] : null; } catch { return null; }
}

// ── SEND EMAIL ────────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
    const payload = JSON.stringify({
        from: "The Ritual Co — Creator Agent <" + FROM_EMAIL + ">",
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
        model: "claude-sonnet-4-6",
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

const SYSTEM_PROMPT = `You are the Creator & Partnerships Agent for The Ritual Co, owned by Gitika Yadav.

Brand: ${BRAND.name} (${BRAND.handle})
Positioning: ${BRAND.positioning}
Product: ${BRAND.product}
Content requirements: ${BRAND.contentRequirements}
Tone: ${BRAND.tone}

Your personality: You know the influencer marketing world inside out. You write DMs that feel personal, not templated. You track creators like a hawk — you know who's overdue, who's ghosting, who's a star. You speak directly to Gitika and draft everything ready to copy-paste.

Your capabilities:
- Analyse creator pipeline and identify what needs action
- Draft personalised outreach emails to creators (not DMs — email is more formal for initial contact)
- Draft follow-up messages for creators who haven't posted
- Draft the creator brief with product details, content requirements, discount codes
- Flag creators who are past deadline
- Recommend which creators to prioritise

Creator statuses:
- shortlisted: identified, not yet contacted
- contacted: outreach sent, awaiting response
- agreed: confirmed participation
- product_sent: product dispatched, 14-day posting clock started
- posted: content live
- completed: content saved, code tracked
- dropped: not proceeding

Always return JSON:
{
  "summary": "2-3 sentence sharp assessment of creator pipeline",
  "actions": [
    {
      "id": "unique_snake_case_id",
      "type": "send_email" | "draft_for_approval" | "alert" | "report",
      "priority": "critical" | "high" | "medium" | "low",
      "title": "short action title",
      "content": "complete ready-to-use draft — full email body, DM text, brief, etc",
      "requiresApproval": true | false,
      "creatorId": "supabase id if action is about a specific creator",
      "creatorHandle": "instagram handle",
      "recipient": "email address if applicable",
      "subject": "email subject if applicable"
    }
  ],
  "insights": ["insight 1", "insight 2"],
  "nextCheckIn": "specific time"
}

requiresApproval: true for all outreach emails and follow-ups (Gitika must approve before sending to creators).
requiresApproval: false for internal reports and alerts to Gitika.`;

// ── ANALYSE PIPELINE ──────────────────────────────────────────────────────────
function analysePipeline(creators) {
    const now = nowIST();
    return creators.map(c => {
        const daysSinceContacted = daysSince(c.contacted_at);
        const daysSinceProductSent = daysSince(c.product_sent_at);
        const daysUntilDeadline = daysUntil(c.posting_deadline);
        const discountCode = c.discount_code || generateDiscountCode(c.instagram_handle);

        let urgency = "low";
        let flag = null;

        if (c.status === "product_sent") {
            if (daysUntilDeadline !== null && daysUntilDeadline < 0) {
                urgency = "critical"; flag = "OVERDUE — past posting deadline";
            } else if (daysUntilDeadline !== null && daysUntilDeadline <= 3) {
                urgency = "high"; flag = "Deadline in " + daysUntilDeadline + " days";
            } else if (daysSinceProductSent !== null && daysSinceProductSent >= 7) {
                urgency = "medium"; flag = "Product sent " + daysSinceProductSent + " days ago — soft follow-up due";
            }
        } else if (c.status === "contacted" && daysSinceContacted > 3) {
            urgency = "medium"; flag = "No response in " + daysSinceContacted + " days";
        } else if (c.status === "shortlisted") {
            urgency = "medium"; flag = "Not yet contacted";
        } else if (c.status === "agreed") {
            urgency = "medium"; flag = "Agreed but product not sent";
        }

        return { ...c, daysSinceContacted, daysSinceProductSent, daysUntilDeadline, discountCode, urgency, flag };
    });
}

// ── EMAIL TEMPLATE ─────────────────────────────────────────────────────────────
function buildEmail(subject, decision, actions, isUrgent) {
    const headerBg = isUrgent ? "#5c1a1a" : "#1a1814";
    const today = nowIST().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const actionsHtml = actions.map(function(a) {
        const pColor = a.priority === "critical" ? "#8b2e2e" : a.priority === "high" ? "#8b5a2b" : "#3d6b52";
        const pBg = a.priority === "critical" ? "#FCEBEB" : a.priority === "high" ? "#FAEEDA" : "#EAF3DE";
        return '<div style="border:1px solid #ece8df;border-radius:8px;padding:16px;margin-bottom:12px">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
            '<strong style="font-size:14px;color:#1a1814">' + a.title + '</strong>' +
            (a.creatorHandle ? '<span style="font-size:11px;color:#6b6660;margin-left:8px">@' + a.creatorHandle + '</span>' : '') +
            '<span style="background:' + pBg + ';color:' + pColor + ';font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;margin-left:8px">' + (a.priority || "").toUpperCase() + '</span>' +
            '</div>' +
            '<div style="background:#f5f2ed;border-radius:6px;padding:12px;font-size:13px;color:#1a1814;line-height:1.6;white-space:pre-wrap">' + (a.content || "") + '</div>' +
            (a.requiresApproval
                    ? '<div style="margin-top:10px"><a href="https://theritualco.in/admin/agents.html" style="background:#1a1814;color:#faf9f6;padding:6px 16px;border-radius:4px;font-size:12px;text-decoration:none;font-weight:500;margin-right:8px">Approve on dashboard</a></div>'
                    : '<p style="margin:8px 0 0;font-size:11px;color:#3d6b52">Sent automatically</p>'
            ) +
            '</div>';
    }).join("");

    const insightsHtml = (decision.insights || []).map(function(i) {
        return '<p style="margin:0 0 6px;font-size:13px;color:#1a1814">• ' + i + '</p>';
    }).join("");

    return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
        '<body style="margin:0;padding:0;background:#f5f2ed;font-family:-apple-system,sans-serif">' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ed;padding:32px 16px"><tr><td align="center">' +
        '<table width="560" cellpadding="0" cellspacing="0" style="background:#faf9f6;border-radius:12px;overflow:hidden;max-width:100%">' +
        '<tr><td style="background:' + headerBg + ';padding:28px 32px">' +
        '<p style="margin:0 0 6px;font-size:10px;letter-spacing:0.15em;color:#c8b8a2;text-transform:uppercase">Creator & Partnerships · The Ritual Co</p>' +
        '<h1 style="margin:0;font-size:20px;color:#faf9f6;font-weight:400">' + subject + '</h1>' +
        '<p style="margin:6px 0 0;font-size:12px;color:#a09890">' + today + '</p></td></tr>' +
        '<tr><td style="padding:24px 32px 0"><p style="margin:0;font-size:14px;color:#1a1814;line-height:1.6">' + decision.summary + '</p></td></tr>' +
        '<tr><td style="padding:20px 32px 0"><h2 style="font-size:12px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px">Actions</h2>' + actionsHtml + '</td></tr>' +
        (insightsHtml ? '<tr><td style="padding:20px 32px 0"><h2 style="font-size:12px;font-weight:600;color:#6b6660;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 10px">Insights</h2>' + insightsHtml + '</td></tr>' : '') +
        '<tr><td style="padding:20px 32px"><a href="https://theritualco.in/admin/creators.html" style="font-size:12px;color:#1a1814;font-weight:500">Open creator dashboard →</a></td></tr>' +
        '<tr><td style="padding:16px 32px;border-top:1px solid #ece8df"><p style="margin:0;font-size:11px;color:#a09890;text-align:center">The Ritual Co · Creator Agent · Next check-in: ' + (decision.nextCheckIn || "tomorrow") + '</p></td></tr>' +
        '</table></td></tr></table></body></html>';
}

// ── MORNING BRIEFING ──────────────────────────────────────────────────────────
async function morningBriefing() {
    const [creators, previousActions] = await Promise.all([getCreators(), getPreviousActions()]);
    const pipeline = analysePipeline(creators);

    const statusCounts = {};
    pipeline.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

    const flagged = pipeline.filter(c => c.flag);
    const pendingApprovals = previousActions.filter(a => a.status === "pending");

    const dataContext = [
        "CREATOR PIPELINE (" + creators.length + " total):",
        "Status breakdown: " + Object.entries(statusCounts).map(([k,v]) => k + ":" + v).join(", "),
        "",
        "CREATORS NEEDING ACTION:",
        flagged.map(c =>
            "- " + c.name + " (@" + c.instagram_handle + ") | " + c.follower_count + " followers | Status: " + c.status +
            " | Flag: " + c.flag + " | Product: " + (c.product_allocated || "TBD") +
            " | Discount code: " + c.discountCode + " | Email: " + (c.email || "unknown")
        ).join("\n") || "None",
        "",
        "ALL CREATORS:",
        pipeline.map(c =>
            "- " + c.name + " (@" + c.instagram_handle + ") | " + c.follower_count + " followers | " +
            c.location + " | Status: " + c.status + " | Product: " + (c.product_allocated || "TBD") +
            " | Barter value: ₹" + (c.barter_value || 0) + " | Email: " + (c.email || "unknown")
        ).join("\n"),
        "",
        "PENDING APPROVALS FROM YESTERDAY (" + pendingApprovals.length + "):",
        pendingApprovals.map(a => "- " + a.title).join("\n") || "None",
        "",
        "BRAND BRIEF FOR DRAFTING:",
        "Product: Silicone Capsule Dumbbells (1kg ₹1,499 / 2kg ₹1,999 early bird)",
        "Content needed: Dedicated reel, tag @theritualco.in, unique discount code in caption",
        "Deadline: 14 days from receiving product",
        "Tone: Aesthetic, aspirational. Think morning routines, soft lighting, lifestyle.",
        "TODAY: " + nowIST().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }),
    ].join("\n");

    const raw = await think(SYSTEM_PROMPT,
        "Analyse the creator pipeline for The Ritual Co. Stock arrives in ~10 days. Gitika needs to start contacting creators NOW so they're ready to receive and post immediately when stock lands. Draft outreach emails for the top priority creators — personalised, warm, on-brand.\n\n" + dataContext,
        3000);

    let decision;
    try { decision = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch { decision = { summary: raw.slice(0, 300), actions: [], insights: [], nextCheckIn: "tomorrow" }; }

    const finalActions = [];
    for (const action of (decision.actions || [])) {
        // Auto-assign discount code if this is an outreach action
        if (action.creatorHandle && !action.content.includes("RITUAL")) {
            const code = generateDiscountCode(action.creatorHandle);
            action.content = action.content + "\n\nYour unique discount code: " + code;
        }
        const logged = await logAction({
            action_type: action.type,
            title: action.title,
            content: action.content,
            status: action.requiresApproval ? "pending" : "executed",
            metadata: {
                priority: action.priority,
                creatorId: action.creatorId,
                creatorHandle: action.creatorHandle,
                recipient: action.recipient,
                subject: action.subject,
            },
        });
        if (logged) action.id = logged.id;
        finalActions.push(action);
    }

    const hasCritical = finalActions.some(a => a.priority === "critical");
    const subject = (hasCritical ? "⚠️ Creator alert" : "🎬 Creator update") +
        " — " + nowIST().toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    await sendEmail(TO_EMAIL, subject, buildEmail(subject, decision, finalActions, hasCritical));
    return { ok: true, actionsCount: finalActions.length, creatorsTracked: creators.length };
}

// ── HANDLE TASK ───────────────────────────────────────────────────────────────
async function handleTask(context) {
    const creators = await getCreators();
    const pipeline = analysePipeline(creators);

    const snapshot = "CREATOR PIPELINE:\n" +
        pipeline.map(c => c.name + " (@" + c.instagram_handle + ") | " + c.follower_count + " followers | Status: " + c.status + " | Flag: " + (c.flag || "none")).join("\n") +
        "\n\nUSER: \"" + (context.message || "") + "\"" +
        "\nINTENT: " + (context.intent || "") +
        "\nURGENCY: " + (context.urgency || "medium");

    const raw = await think(SYSTEM_PROMPT,
        "Gitika has a request about her creator programme. Respond directly. Draft everything ready to use.\n\n" + snapshot,
        2000);

    let decision;
    try { decision = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch { decision = { summary: raw, actions: [{ type: "report", title: "Response", content: raw, requiresApproval: false, priority: "medium" }], insights: [] }; }

    for (const action of (decision.actions || [])) {
        await logAction({
            action_type: action.type,
            title: action.title,
            content: action.content,
            status: action.requiresApproval ? "pending" : "executed",
            metadata: { priority: action.priority, creatorHandle: action.creatorHandle },
        });
    }

    const subject = "Creator: " + (context.intent || context.message || "response").slice(0, 60);
    await sendEmail(TO_EMAIL, subject, buildEmail(subject, decision, decision.actions || [], false));

    return {
        ok: true,
        response: decision.summary,
        actions: decision.actions,
        requiresApproval: (decision.actions || []).some(a => a.requiresApproval),
    };
}

// ── EXECUTE APPROVED ──────────────────────────────────────────────────────────
async function executeApproved(context) {
    const action = context.action;
    if (!action) return { ok: false, error: "No action data" };

    // Send email to creator
    if (action.metadata && action.metadata.recipient) {
        await sendEmail(
            action.metadata.recipient,
            action.metadata.subject || "The Ritual Co — Ambassador Programme",
            '<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.7;color:#1a1814;max-width:560px;margin:0 auto;padding:32px 16px;white-space:pre-wrap">' + action.content + '</div>'
        );

        // Update creator status to contacted
        if (action.metadata.creatorId) {
            await updateCreator(action.metadata.creatorId, {
                status: "contacted",
                contacted_at: new Date().toISOString(),
                discount_code: action.metadata.discountCode || generateDiscountCode(action.metadata.creatorHandle || ""),
                updated_at: new Date().toISOString(),
            });
        }
    }

    // Mark action as executed
    await supabaseReq("agent_actions?id=eq." + context.actionId, "PATCH",
        { status: "executed", actioned_at: new Date().toISOString() });

    // Notify Gitika
    await sendEmail(TO_EMAIL, "✓ Sent to " + (action.metadata?.creatorHandle || "creator"),
        '<p style="font-family:sans-serif;font-size:14px">Outreach email sent to <strong>' + (action.metadata?.creatorHandle || "creator") + '</strong>. Their status has been updated to "contacted" in your dashboard.</p>');

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
        console.error("Creator agent error:", err);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};