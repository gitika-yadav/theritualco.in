// javascript/arrives-by.js
// "Order today · arrives Tue 4 – Sat 8 Nov" under Add to Cart on product pages.
// Hidden when the button isn't a plain "Add to Cart" (sold out / pre-order).
//
// Window = dispatch (within 24h, Mon–Sat) + 2–5 days transit, skipping Sundays.
// Change the numbers below if your dispatch or courier times change.

(function () {
    var DISPATCH_DAYS = 1;   // working days until it's handed to Delhivery
    var TRANSIT_MIN = 2;     // working days in transit (fastest)
    var TRANSIT_MAX = 5;     // working days in transit (slowest)

    var btn = document.getElementById("preorder-btn");
    if (!btn) return;
    // Pre-order products ship later; never promise a date for them.
    if (/capsule-dumbbell/.test(location.pathname)) return;

    // "Today" in India, whatever the shopper's device timezone.
    function istToday() {
        var p = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).split("-");
        return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12);
    }
    function addWorkingDays(d, n) {
        var x = new Date(d.getTime());
        while (n > 0) {
            x.setDate(x.getDate() + 1);
            if (x.getDay() !== 0) n--; // Sundays don't count
        }
        return x;
    }
    var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function fmt(d, withMonth) { return DAYS[d.getDay()] + " " + d.getDate() + (withMonth ? " " + MONTHS[d.getMonth()] : ""); }

    var today = istToday();
    var from = addWorkingDays(today, DISPATCH_DAYS + TRANSIT_MIN);
    var to = addWorkingDays(today, DISPATCH_DAYS + TRANSIT_MAX);
    var range = from.getMonth() === to.getMonth()
        ? fmt(from, false) + " – " + fmt(to, true)
        : fmt(from, true) + " – " + fmt(to, true);

    var el = document.createElement("p");
    el.className = "arrives-by";
    el.innerHTML =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17.5" cy="17.5" r="1.6"/></svg>' +
        '<span>Order today &middot; arrives <strong>' + range + '</strong></span>';
    btn.insertAdjacentElement("afterend", el);

    function sync() {
        var ok = !btn.disabled && /add to cart/i.test(btn.textContent || "");
        el.style.display = ok ? "" : "none";
    }
    sync();
    new MutationObserver(sync).observe(btn, { attributes: true, childList: true, characterData: true, subtree: true });
})();
