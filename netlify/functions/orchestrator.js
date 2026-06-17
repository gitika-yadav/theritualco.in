// netlify/functions/orchestrator.js
// The Ritual Co — Agent Orchestrator
//
// Receives messages from:
//   1. Dashboard (POST with JSON body)
//   2. Email replies (POST from email webhook — future)
//   3. Cron trigger (GET — runs morning briefing across all agents)
//
// Routes to: finance-agent | ops-agent | marketing-agent | creator-agent
// Logs all actions to Supabase agent_actions table

const https = require("https");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BRIEFING_SECRET = process.env.BRIEFING_SECRET;
const BASE_URL = process.env.URL || "https://theritualco.in";

// ── HTTP HELPER ───────────────────────────────────────────────────────────────
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

function supabaseRequest(path, method = "GET", body = null, params = "") {
    const hostname = new URL(SUPABASE_URL).hostname;
    const payload = body ? JSON.stringify(body) : null;
    return request({
        hostname,
        path: `/rest/v1/${path}${params}`,
        method,
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": method === "POST" ? "return=representation" : "",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
    }, payload);
}

// ── CLAUDE API ────────────────────────────────────────────────────────────────
async function claude(systemPrompt, userMessage, maxTokens = 1000) {
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
    if (res.status !== 200) throw new Error(`Claude error: ${data.error?.message}`);
    return data.content[0].text;
}

// ── ROUTING ───────────────────────────────────────────────────────────────────
async function routeMessage(message) {
    const routingPrompt = `You are the orchestrator for The Ritual Co's agent system.
The company is IORO Movement Private Limited — a premium D2C women's wellness brand selling silicone capsule dumbbells in Delhi.

Available agents:
- finance: GST filings, ROC compliance, P&L, deadlines, Razorpay revenue, tax
- ops: orders, shipping, inventory, Shiprocket, stock levels
- marketing: Instagram content, captions, blog posts, brand strategy, SheSundays partnership
- creator: influencer outreach, barter programme, creator briefs, follow-ups, discount codes

Given the user's message, return ONLY a JSON object like:
{
  "agent": "finance" | "ops" | "marketing" | "creator",
  "intent": "one sentence describing what the user wants",
  "urgency": "high" | "medium" | "low"
}

No explanation. JSON only.`;

    const raw = await claude(routingPrompt, message, 200);
    try {
        const clean = raw.replace(/```json|```/g, "").trim();
        return JSON.parse(clean);
    } catch {
        return { agent: "finance", intent: message, urgency: "medium" };
    }
}

// ── CALL AGENT ────────────────────────────────────────────────────────────────
async function callAgent(agentName, task, context = {}) {
    const agentUrl = `${BASE_URL}/.netlify/functions/${agentName}-agent`;
    const payload = JSON.stringify({ task, context, source: "orchestrator" });

    const res = await request({
        hostname: new URL(agentUrl).hostname,
        path: new URL(agentUrl).pathname,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "x-orchestrator-secret": BRIEFING_SECRET || "",
        },
    }, payload);

    try { return JSON.parse(res.body); } catch { return { ok: false, error: res.body }; }
}

// ── LOG ACTION ────────────────────────────────────────────────────────────────
async function logAction({ agent, action_type, title, content, status, metadata }) {
    const res = await supabaseRequest("agent_actions", "POST", {
        agent, action_type, title, content,
        status: status || "pending",
        metadata: metadata || {},
    });
    try { return JSON.parse(res.body)[0]; } catch { return null; }
}

// ── GET PENDING ACTIONS ───────────────────────────────────────────────────────
async function getPendingActions(agent = null) {
    const filter = agent
        ? `?agent=eq.${agent}&status=eq.pending&order=created_at.desc&limit=20`
        : `?status=eq.pending&order=created_at.desc&limit=50`;
    const res = await supabaseRequest("agent_actions", "GET", null, filter);
    try { return JSON.parse(res.body); } catch { return []; }
}

// ── UPDATE ACTION STATUS ──────────────────────────────────────────────────────
async function updateActionStatus(id, status) {
    const res = await supabaseRequest(
        `agent_actions?id=eq.${id}`,
        "PATCH",
        { status, actioned_at: new Date().toISOString() }
    );
    return res.status === 200 || res.status === 204;
}

// ── MORNING BRIEFING (CRON) ───────────────────────────────────────────────────
// Fire agents in parallel, return immediately — each agent emails results independently
function fireAgent(agentName) {
    const agentUrl = BASE_URL + "/.netlify/functions/" + agentName + "-agent";
    const payload = JSON.stringify({ task: "morning_briefing", context: { cron: true }, source: "orchestrator" });
    // Fire and forget — do NOT await, avoids Netlify 10s timeout
    request({
        hostname: new URL(agentUrl).hostname,
        path: new URL(agentUrl).pathname,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "x-orchestrator-secret": BRIEFING_SECRET || "",
        },
    }, payload).catch(function(err) { console.error(agentName + " fire error:", err.message); });
}

async function runMorningBriefing() {
    // Only fire agents that are built — add ops/marketing when ready
    const agents = ["finance", "creator"];
    agents.forEach(fireAgent);
    return agents.map(function(agent) { return { agent: agent, ok: true, status: "fired" }; });
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": "application/json",
    };

    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    // ── CRON: morning briefing ──
    if (event.httpMethod === "GET") {
        const secret = BRIEFING_SECRET;
        if (secret && event.queryStringParameters?.secret !== secret) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorised" }) };
        }
        // Don't await — agents fire independently and email results
        // Return 200 immediately so cron-job.org doesn't retry
        runMorningBriefing().catch(err => console.error("Briefing error:", err.message));
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, status: "agents fired" }) };
    }

    // ── POST: dashboard or email reply ──
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    // Auth check for dashboard calls
    const authHeader = event.headers?.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token || !validateToken(token)) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorised" }) };
    }

    let body;
    try { body = JSON.parse(event.body || "{}"); } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
    }

    const { type, message, actionId, agent: specifiedAgent } = body;

    // ── APPROVE / REJECT action ──
    if (type === "approve" || type === "reject") {
        if (!actionId) return { statusCode: 400, headers, body: JSON.stringify({ error: "actionId required" }) };
        const ok = await updateActionStatus(actionId, type === "approve" ? "approved" : "rejected");

        if (type === "approve") {
            // Tell the relevant agent to execute the approved action
            const actions = await supabaseRequest("agent_actions", "GET", null, `?id=eq.${actionId}`);
            const action = JSON.parse(actions.body)[0];
            if (action) {
                await callAgent(action.agent, "execute_approved", { actionId, action });
            }
        }

        return { statusCode: 200, headers, body: JSON.stringify({ ok }) };
    }

    // ── GET pending actions ──
    if (type === "get_actions") {
        const actions = await getPendingActions(specifiedAgent || null);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, actions }) };
    }

    // ── TASK an agent ──
    if (type === "task" && message) {
        // Route to correct agent
        const route = specifiedAgent
            ? { agent: specifiedAgent, intent: message, urgency: "medium" }
            : await routeMessage(message);

        // Call the agent
        const result = await callAgent(route.agent, "task", {
            message,
            intent: route.intent,
            urgency: route.urgency,
        });

        // Log it
        await logAction({
            agent: route.agent,
            action_type: "task",
            title: route.intent,
            content: result.response || JSON.stringify(result),
            status: result.requiresApproval ? "pending" : "executed",
            metadata: { originalMessage: message, urgency: route.urgency },
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true, agent: route.agent, result }),
        };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown request type" }) };
};

// ── TOKEN VALIDATION (same as admin-auth.js) ──────────────────────────────────
function validateToken(token) {
    if (!token) return false;
    const [expires, hmac] = token.split(".");
    if (!expires || !hmac) return false;
    if (Date.now() > parseInt(expires, 10)) return false;
    const expected = crypto
        .createHmac("sha256", process.env.ADMIN_PASSWORD)
        .update(expires)
        .digest("hex");
    return hmac === expected;
}