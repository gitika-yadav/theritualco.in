// netlify/functions/shared/owner-email.js
// The "new order" email that lands in the owner's inbox. Used for prepaid
// orders (verify-payment) and for the gift block in COD orders (create-order).

const OWNER_EMAIL = "theritualcoofficial@gmail.com";

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ROW = (k, v) => `<tr><td style="padding:6px 20px 6px 0;color:#888;vertical-align:top">${k}</td><td>${v}</td></tr>`;

function itemLines(items) {
    return (items || []).map(i => {
        const bits = [i.product_name, i.weight, i.color].filter(Boolean).map(esc).join(" ");
        return `${bits} ×${i.quantity ?? i.qty ?? 1}${i.is_preorder ? " <em>(pre-order)</em>" : ""}`;
    }).join("<br>");
}

// Rows to add to any owner email when the shopper ticked "This is a gift".
function giftRows(o) {
    if (!o || !o.is_gift) return "";
    return ROW("🎁 Gift", "<strong>Yes — gift wrap + wish card, no prices in the parcel</strong>") +
        ROW("Ship to", esc(o.gift_recipient) + (o.gift_recipient_phone ? " · " + esc(o.gift_recipient_phone) : "")) +
        ROW("Card message", o.gift_message ? "<em>“" + esc(o.gift_message) + "”</em>" : "—");
}

function istTime(d) {
    return new Date(d || Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

// Owner email for a paid (online) order.
function prepaidOwnerEmail(o, paymentId) {
    const amount = ((o.amount_paise || 0) / 100).toLocaleString("en-IN");
    const subject = `${o.is_gift ? "🎁" : "🛒"} New paid order — ${o.guest_name || "Customer"} — ₹${amount}`;
    const html = `
<h2 style="font-family:sans-serif">New Paid Order${o.is_gift ? " · Gift" : ""}</h2>
<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
${ROW("Name", "<strong>" + esc(o.guest_name) + "</strong>")}
${ROW("Email", esc(o.guest_email))}
${ROW("Phone", esc(o.guest_phone))}
${ROW("Address", esc(o.shipping_address))}
${ROW("Items", itemLines(o.items))}
${giftRows(o)}
${o.discount_code ? ROW("Discount", esc(o.discount_code) + (o.discount_amount ? " (−₹" + esc(o.discount_amount) + ")" : "")) : ""}
${ROW("Payment", "<strong>Paid online</strong>")}
${ROW("Amount paid", "<strong>₹" + amount + "</strong>")}
${ROW("Payment ID", '<span style="font-size:12px;color:#555">' + esc(paymentId) + "</span>")}
${ROW("Time", istTime(o.created_at) + " IST")}
</table>
<p style="font-family:sans-serif;font-size:13px;color:#888">Ship it from Admin → Orders.</p>`;
    return { to: OWNER_EMAIL, subject, html };
}

module.exports = { OWNER_EMAIL, giftRows, prepaidOwnerEmail, esc };
