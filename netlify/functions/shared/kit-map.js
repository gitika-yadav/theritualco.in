// netlify/functions/shared/kit-map.js
// Defines what each kit contains. A kit purchase decrements the SAME
// individual-product inventory as buying each piece separately — this map
// tells create-order.js which components (and quantities) to resolve a
// kit line-item into.
//
// IMPORTANT: whenever a kit's contents or price change, update it here —
// this is the single source of truth for kit composition.

const KIT_MAP = {
    "yoga-essentials-kit": {
        id: "yoga-essentials-kit",
        name: "Yoga Essentials Kit",
        price_paise: 639700,
        components: [
            { product_id: "yoga-mat-5mm", qty: 1 },
            { product_id: "yoga-belt", qty: 1 },
            { product_id: "yoga-block", qty: 1 },
        ],
    },
    "yoga-studio-kit": {
        id: "yoga-studio-kit",
        name: "Yoga Studio Kit",
        price_paise: 229700,
        components: [
            { product_id: "yoga-belt", qty: 1 },
            { product_id: "yoga-block", qty: 2 },
        ],
    },
    "pilates-starter-kit": {
        id: "pilates-starter-kit",
        name: "Pilates Starter Kit",
        price_paise: 999600,
        components: [
            { product_id: "yoga-mat-5mm", qty: 1 },
            { product_id: "pilates-ring", qty: 1 },
            { product_id: "pilates-ball", qty: 1 },
            { product_id: "capsule-1kg", qty: 1 },
        ],
    },
    "pilates-sculpt-kit": {
        id: "pilates-sculpt-kit",
        name: "Pilates Sculpt Kit",
        price_paise: 849600,
        components: [
            { product_id: "pilates-ring", qty: 1 },
            { product_id: "pilates-ball", qty: 1 },
            { product_id: "capsule-1kg", qty: 1 },
            { product_id: "ankle-weights-2lb", qty: 1 },
        ],
    },
    "pilates-complete-kit": {
        id: "pilates-complete-kit",
        name: "Pilates Complete Kit",
        price_paise: 1439400,
        components: [
            { product_id: "yoga-mat-5mm", qty: 1 },
            { product_id: "pilates-ring", qty: 1 },
            { product_id: "pilates-ball", qty: 1 },
            { product_id: "capsule-1kg", qty: 1 },
            { product_id: "ankle-weights-2lb", qty: 1 },
            { product_id: "yoga-block", qty: 1 },
        ],
    },
    // Fixed-colour set: each component carries its own `color`, which
    // overrides the customer's chosen colour (see create-order.js).
    "grip-socks-trio": {
        id: "grip-socks-trio",
        name: "The Ritual Socks — The Trio",
        price_paise: 149900,
        components: [
            { product_id: "grip-socks", qty: 1, color: "Cream" },
            { product_id: "grip-socks", qty: 1, color: "Pink" },
            { product_id: "grip-socks", qty: 1, color: "Coffee" },
        ],
    },
};

module.exports = { KIT_MAP };