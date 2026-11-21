// Gift orders: the buyer gets a private "unwrap" link to send the recipient.
function giftLinkBlock(o) {
    if (!o || !o.is_gift || !o.gift_token) return "";
    const url = "https://theritualco.in/gift?t=" + o.gift_token;
    const first = String(o.gift_recipient || "them").split(" ")[0];
    return `<div style="background:#faf6f2;border-radius:12px;padding:20px 24px;margin:0 0 28px;">
<p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a09890;margin:0 0 8px;">🎁 Your digital gift card</p>
<p style="font-size:15px;color:#3a3330;margin:0 0 14px;">Send ${first} a little surprise before the parcel arrives: an animated card with your message that they unwrap on their phone. It never shows prices.</p>
<a href="${url}" style="display:inline-block;background:#2a2420;color:#fff;text-decoration:none;border-radius:10px;padding:12px 22px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.14em;text-transform:uppercase;">Open &amp; share the card</a>
<p style="font-size:12px;color:#a09890;margin:12px 0 0;word-break:break-all;">${url}</p></div>`;
}
module.exports = { giftLinkBlock };
