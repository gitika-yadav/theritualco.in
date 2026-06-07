// cart-drawer.js — drawer logic, loaded after navbar partial
// Include in navbar.js or as a separate script after navbar loads

(() => {

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
            return;
        }

        emptyEl.style.display  = "none";
        footerEl.style.display = "block";

        itemsEl.innerHTML = cart.items.map(item => `
      <div class="cd-item" data-key="${item.key}">
        ${item.image
            ? `<img src="${item.image}" alt="${item.name}" class="cd-item-img" loading="lazy"/>`
            : `<div class="cd-item-img cd-item-placeholder"></div>`}
        <div class="cd-item-info">
          <p class="cd-item-name">${item.name}</p>
          <p class="cd-item-meta">${item.weight} · ${item.color}</p>
          <p class="cd-item-price">₹${(item.price).toLocaleString("en-IN")}</p>
        </div>
        <div class="cd-item-qty">
          <button onclick="CartDrawer.changeQty('${item.key}', ${item.qty - 1})">−</button>
          <span>${item.qty}</span>
          <button onclick="CartDrawer.changeQty('${item.key}', ${item.qty + 1})">+</button>
        </div>
        <button class="cd-item-remove" onclick="Cart.remove('${item.key}')" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join("");

        document.getElementById("cd-total").textContent =
            "₹" + Cart.total().toLocaleString("en-IN");
    }

    function open() {
        render();
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