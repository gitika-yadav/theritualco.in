// Shared admin navigation. Add to any admin page with:
//   <script src="/javascript/admin-nav.js" defer></script>
// To add a new admin page, add it to ADMIN_PAGES below — the top bar
// and the /admin menu both read from this list.
(function () {
    var ADMIN_PAGES = [
        { group: "Sales",     href: "/admin/orders",          label: "Orders",          desc: "Website orders, shipping via Delhivery" },
        { group: "Sales",     href: "/admin/discounts",       label: "Discounts",       desc: "Discount codes" },
        { group: "Sales",     href: "/admin/wholesale-order", label: "Wholesale order", desc: "Create a B2B / wholesale order" },
        { group: "Sales",     href: "/admin/creator-order",   label: "Creator gift",    desc: "Send a ₹0 order to a creator" },
        { group: "Events",    href: "/admin/events",          label: "Events",          desc: "Events, bookings and leads" },
        { group: "Events",    href: "/admin/event-order",     label: "Event stock",     desc: "Inventory sent out for events" },
        { group: "Marketing", href: "/admin/analytics",       label: "Analytics",       desc: "How the week went" },
        { group: "Marketing", href: "/admin/customers",       label: "Customers",       desc: "Repeat purchase rate and lifetime value" },
        { group: "Marketing", href: "/admin/newsletter",      label: "Newsletter",      desc: "Subscribers and sends" },
        { group: "Marketing", href: "/admin/creators",        label: "Creators",        desc: "Ambassador pipeline" },
        { group: "Marketing", href: "/admin/outreach",        label: "Outreach",        desc: "Outreach hub" },
        { group: "Marketing", href: "/admin/roi-simulator",   label: "ROI simulator",   desc: "Channel ROI simulator" },
        { group: "Company",   href: "/admin/compliance",      label: "Compliance",      desc: "IORO Movement filings tracker" },
        { group: "Company",   href: "/admin/agents",          label: "Agents",          desc: "Agent dashboard" },
    ];
    window.RC_ADMIN_PAGES = ADMIN_PAGES;

    var path = location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";

    var css = "" +
        "#rc-admin-nav{position:sticky;top:0;z-index:10000;background:#1a1714;color:#f5f2ee;" +
        "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;" +
        "gap:4px;height:40px;padding:0 16px;overflow-x:auto;white-space:nowrap;scrollbar-width:none;}" +
        "#rc-admin-nav::-webkit-scrollbar{display:none;}" +
        "#rc-admin-nav a{color:#bfb6ad;text-decoration:none;padding:5px 10px;border-radius:6px;flex:none;}" +
        "#rc-admin-nav a:hover{color:#fff;background:rgba(255,255,255,.08);}" +
        "#rc-admin-nav a.on{color:#1a1714;background:#f5f2ee;}" +
        "#rc-admin-nav .rc-home{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#f5f2ee;margin-right:8px;}" +
        "#rc-admin-nav .rc-sep{width:1px;height:16px;background:#4a423d;margin:0 6px;flex:none;}" +
        "#rc-admin-nav .rc-site{margin-left:auto;}";

    function build() {
        if (document.getElementById("rc-admin-nav")) return;
        var style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);

        var nav = document.createElement("nav");
        nav.id = "rc-admin-nav";
        nav.setAttribute("aria-label", "Admin");

        var home = document.createElement("a");
        home.href = "/admin";
        home.className = "rc-home" + (path === "/admin" ? " on" : "");
        home.textContent = "The Ritual Co. Admin";
        nav.appendChild(home);

        var lastGroup = null;
        ADMIN_PAGES.forEach(function (p) {
            if (lastGroup && p.group !== lastGroup) {
                var sep = document.createElement("span");
                sep.className = "rc-sep";
                nav.appendChild(sep);
            }
            lastGroup = p.group;
            var a = document.createElement("a");
            a.href = p.href;
            a.textContent = p.label;
            a.title = p.desc;
            if (path === p.href) { a.className = "on"; a.setAttribute("aria-current", "page"); }
            nav.appendChild(a);
        });

        var site = document.createElement("a");
        site.href = "/";
        site.className = "rc-site";
        site.textContent = "View site ↗";
        nav.appendChild(site);

        document.body.insertBefore(nav, document.body.firstChild);
        var on = nav.querySelector("a.on");
        if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
    else build();
})();
