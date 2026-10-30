// cart-drawer.js — drawer logic, loaded after navbar partial
// Include in navbar.js or as a separate script after navbar loads

(() => {

    // ── "Pairs well" + Solo → Trio nudge ───────────────────────────────
    // One suggestion under the cart items, so shoppers can grow the order
    // without leaving the drawer:
    //   1. Solo grip socks in the cart (1–2 pairs, no Trio)  → offer The Trio
    //   2. Otherwise → one matching-colour add-on that isn't in the cart yet
    const SHADE = { Cream: "Vanilla Cream", Pink: "Strawberry Milk", Black: "Onyx Black", Coffee: "Oat Latte" };
    const TRIO = { id: "grip-socks-trio", name: "The Ritual Socks — The Trio", color: "Cream / Pink / Coffee", price: 1499, image: "/images/grip-socks-trio.webp" };

    // Add-ons the drawer can suggest (kept to the pieces that pair with everything).
    const ADDONS = {
        "grip-socks":        { name: "The Ritual Grip Socks", price: 699,  note: "Grip socks, one pair", url: "/products/the-ritual-socks",
                               img: { Cream: "/images/grip-socks-cream-1.webp", Pink: "/images/grip-socks-pink-1.webp", Coffee: "/images/grip-socks-coffee-1.webp" } },
        "pilates-ball":      { name: "The Ritual Ball", price: 999, note: "Soft Pilates ball", url: "/products/the-ritual-ball",
                               img: { Cream: "/images/pilates-ball-cream.webp", Pink: "/images/pilates-ball-pink.webp", Black: "/images/pilates-ball-black.webp", Coffee: "/images/pilates-ball-coffee.webp" } },
        "yoga-belt":         { name: "The Ritual Belt", weight: "96in", price: 499, note: "Cotton yoga strap", url: "/products/the-ritual-belt",
                               img: { Cream: "/images/yoga-belt-cream-1.webp", Black: "/images/yoga-belt-black-stretch.webp", Coffee: "/images/yoga-belt-coffee-roll.webp" } },
        "ankle-weights-2lb": { name: "The Ritual Cuffs", weight: "2lb", price: 3499, note: "Ankle & wrist weights, pair", url: "/products/the-ritual-cuffs",
                               img: { Cream: "/images/cuffs-cream-ankles-ball.webp", Pink: "/images/cuffs-pink-wrists-back.webp", Black: "/images/cuffs-black-wrists.webp", Coffee: "/images/cuffs-coffee-wrists.webp" } }
    };
    // What to suggest for the last thing added, smallest add-on first.
    const PAIRS = {
        "yoga-mat-5mm":      ["grip-socks", "pilates-ball", "yoga-belt", "ankle-weights-2lb"],
        "ankle-weights-2lb": ["grip-socks", "pilates-ball", "yoga-belt"],
        "pilates-ball":      ["grip-socks", "yoga-belt", "ankle-weights-2lb"],
        "grip-socks":        ["pilates-ball", "yoga-belt", "ankle-weights-2lb"],
        "grip-socks-trio":   ["pilates-ball", "yoga-belt", "ankle-weights-2lb"],
        "yoga-belt":         ["grip-socks", "pilates-ball"],
        "yoga-block":        ["yoga-belt", "grip-socks", "pilates-ball"],
        "pilates-ring":      ["pilates-ball", "grip-socks", "yoga-belt"],
        "capsule-dumbbell":  ["ankle-weights-2lb", "grip-socks", "pilates-ball"]
    };
    const DEFAULT_PAIRS = ["grip-socks", "pilates-ball", "yoga-belt"];

    function livePrice(id, fallback) {
        const p = typeof window.getCurrentPrice === "function" ? Number(window.getCurrentPrice(id)) : 0;
        return p || fallback;
    }
    function rupees(n) { return "₹" + Number(n).toLocaleString("en-IN"); }
    function track(name) {
        try { if (typeof window.gtag === "function") window.gtag("event", "select_promotion", { promotion_name: name }); } catch (e) {}
    }

    function trioOffer(cart) {
        if (cart.items.some(i => i.id === TRIO.id)) return null;
        const solos = cart.items.filter(i => i.id === "grip-socks");
        const pairs = solos.reduce((n, i) => n + i.qty, 0);
        if (pairs < 1 || pairs > 2) return null;
        const soloTotal = solos.reduce((n, i) => n + i.price * i.qty, 0);
        const extra = TRIO.price - soloTotal;
        return extra > 0 ? { extra, pairs } : null;
    }

    function pairOffer(cart) {
        if (!cart.items.length) return null;
        const inCart = new Set(cart.items.map(i => i.id === TRIO.id ? "grip-socks" : i.id));
        const anchor = cart.items[cart.items.length - 1];
        const wanted = SHADE[anchor.color] ? anchor.color : "Cream";
        const list = PAIRS[anchor.id] || DEFAULT_PAIRS;
        for (const id of list) {
            if (inCart.has(id)) continue;
            const a = ADDONS[id];
            const order = [wanted, "Cream", "Pink", "Coffee", "Black"].filter((c, n, arr) => arr.indexOf(c) === n);
            const colour = order.find(c => a.img[c] && Cart.getRemaining(id, a.weight, c) > 0);
            if (colour) return { id, colour, matched: !!SHADE[anchor.color] && colour === wanted };
        }
        return null;
    }

    function upsellEl() {
        let el = document.getElementById("cd-upsell");
        if (!el) {
            const items = document.getElementById("cd-items");
            if (!items) return null;
            el = document.createElement("div");
            el.id = "cd-upsell";
            items.insertAdjacentElement("afterend", el);
            el.addEventListener("click", onUpsellClick);
        }
        return el;
    }

    function renderUpsell(cart) {
        const el = upsellEl();
        if (!el) return;
        const drawer = document.getElementById("cart-drawer");
        const trio = cart.items.length ? trioOffer(cart) : null;
        const pair = trio ? null : pairOffer(cart);

        if (trio) {
            el.innerHTML = `
      <div class="cd-up">
        <img src="${TRIO.image}" alt="The Ritual Socks Trio in Cream, Pink and Coffee" class="cd-up-img" loading="lazy"/>
        <div class="cd-up-info">
          <p class="cd-up-eyebrow">Make it The Trio</p>
          <p class="cd-up-name">One pair in each shade</p>
          <p class="cd-up-meta">${rupees(trio.extra)} more &middot; Cream, Pink &amp; Coffee</p>
        </div>
        <button type="button" class="cd-up-btn" data-action="trio">Upgrade</button>
      </div>`;
        } else if (pair) {
            const a = ADDONS[pair.id];
            el.innerHTML = `
      <div class="cd-up">
        <a href="${a.url}?color=${pair.colour}" class="cd-up-media"><img src="${a.img[pair.colour]}" alt="${a.name} in ${SHADE[pair.colour]}" class="cd-up-img" loading="lazy"/></a>
        <div class="cd-up-info">
          <p class="cd-up-eyebrow">${pair.matched ? "Pairs well &middot; to match" : "Pairs well"}</p>
          <p class="cd-up-name">${a.name}</p>
          <p class="cd-up-meta">${SHADE[pair.colour]} &middot; ${rupees(livePrice(pair.id, a.price))}</p>
        </div>
        <button type="button" class="cd-up-btn" data-action="add" data-id="${pair.id}" data-colour="${pair.colour}">Add</button>
      </div>`;
        } else {
            el.innerHTML = "";
        }
        el.style.display = el.innerHTML ? "block" : "none";
        if (drawer) drawer.classList.toggle("has-upsell", !!el.innerHTML);
    }

    function onUpsellClick(e) {
        const btn = e.target.closest(".cd-up-btn");
        if (!btn) return;
        if (btn.dataset.action === "trio") {
            Cart.get().items.filter(i => i.id === "grip-socks").forEach(i => Cart.remove(i.key));
            Cart.add({ ...TRIO, price: livePrice(TRIO.id, TRIO.price) });
            track("drawer_trio_upgrade");
        } else {
            const id = btn.dataset.id, colour = btn.dataset.colour, a = ADDONS[id];
            const line = { id, name: a.name, color: colour, price: livePrice(id, a.price), image: a.img[colour] };
            if (a.weight) line.weight = a.weight;
            Cart.add(line);
            track("drawer_pairs_well");
        }
    }

    function render() {
        const cart     = Cart.get();
        const itemsEl  = document.getElementById("cd-items");
        const footerEl = document.getElementById("cd-footer");
        const emptyEl  = document.getElementById("cd-empty");
        if (!itemsEl) return;

        if (cart.items.length === 0) {
            itemsEl.innerHTML  = "";
            footerEl.style.display = "none";
            emptyEl.style.display  = "flex";
            renderUpsell(cart);
            return;
        }

        emptyEl.style.display  = "none";
        footerEl.style.display = "block";

        itemsEl.innerHTML = cart.items.map(item => {
            const available = Cart.getAvailable(item.id, item.weight, item.color);
            const atLimit = Number.isFinite(available) && item.qty >= available;
            const plusBtn = atLimit
                ? `<button class="cd-qty-plus" disabled title="Max stock reached">+</button>`
                : `<button onclick="CartDrawer.changeQty('${item.key}', ${item.qty + 1})">+</button>`;
            return `
      <div class="cd-item" data-key="${item.key}">
        ${item.image
            ? `<img src="${item.image}" alt="${item.name}" class="cd-item-img" loading="lazy"/>`
            : `<div class="cd-item-img cd-item-placeholder"></div>`}
        <div class="cd-item-info">
          <p class="cd-item-name">${item.name}</p>
          <p class="cd-item-meta">${[item.weight, item.color].filter(Boolean).join(" · ")}</p>
          <p class="cd-item-price">₹${(item.price).toLocaleString("en-IN")}</p>
          ${atLimit ? `<p class="cd-item-stock">Max of ${available} in stock</p>` : ""}
        </div>
        <div class="cd-item-qty">
          <button onclick="CartDrawer.changeQty('${item.key}', ${item.qty - 1})">−</button>
          <span>${item.qty}</span>
          ${plusBtn}
        </div>
        <button class="cd-item-remove" onclick="Cart.remove('${item.key}')" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `;
        }).join("");

        document.getElementById("cd-total").textContent =
            "₹" + Cart.total().toLocaleString("en-IN");

        renderUpsell(cart);
    }

    function open() {
        render();
        if (window.Cart && Cart.trackViewCart) Cart.trackViewCart();
        document.getElementById("cart-drawer").classList.add("is-open");
        document.getElementById("cart-drawer-overlay").classList.add("is-open");
        document.body.style.overflow = "hidden";
    }

    function close() {
        document.getElementById("cart-drawer").classList.remove("is-open");
        document.getElementById("cart-drawer-overlay").classList.remove("is-open");
        document.body.style.overflow = "";
    }

    function changeQty(key, qty) {
        Cart.updateQty(key, qty);
        render();
    }

    // Re-render drawer when cart updates
    window.addEventListener("cart:updated", render);

    window.CartDrawer = { open, close, changeQty };
})();