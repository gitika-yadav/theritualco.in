// netlify/functions/shared/kit-map.js
// Defines what each kit contains. A kit purchase decrements the SAME
// individual-product inventory as buying each piece separately — this map
// tells create-order.js which components (and quantities) to resolve a
// kit line-item into.
//
// IMPORTANT: whenever a kit's contents or price change, update it here —
// this is the single source of truth for kit composition.

// When a pre-order product is short of stock, orders still go through,
// are marked is_preorder, and take no stock until fulfilled.
const PREORDER_SHIPS = "December";

const KIT_MAP = {
    "yoga-essentials-kit": {
        id: "yoga-essentials-kit",
        preorder: true, // can be ordered while a piece is out of stock; ships at restock
        name: "Yoga Essentials Kit",
        price_paise: 579900, mrp_paise: 639700, // kit price; mrp = pieces bought separately
        noCodes: true, // discount codes don't stack on kits
        components: [
            { product_id: "yoga-mat-5mm", qty: 1 },
            // No pink belt: the pink kit ships with a Cream belt.
            { product_id: "yoga-belt", qty: 1, colorMap: { Pink: "Cream" } },
            { product_id: "yoga-block", qty: 1 },
        ],
    },
    "yoga-studio-kit": {
        id: "yoga-studio-kit",
        preorder: true, // can be ordered while a piece is out of stock; ships at restock
        name: "Yoga Studio Kit",
        price_paise: 209900, mrp_paise: 229700, // kit price; mrp = pieces bought separately
        noCodes: true, // discount codes don't stack on kits
        components: [
            // No pink belt: the pink kit ships with a Cream belt.
            { product_id: "yoga-belt", qty: 1, colorMap: { Pink: "Cream" } },
            { product_id: "yoga-block", qty: 2 },
        ],
    },
    "pilates-starter-kit": {
        id: "pilates-starter-kit",
        preorder: true, // can be ordered while a piece is out of stock; ships at restock
        name: "Pilates Starter Kit",
        price_paise: 879900, mrp_paise: 999600, // kit price; mrp = pieces bought separately
        noCodes: true, // discount codes don't stack on kits
        components: [
            { product_id: "yoga-mat-5mm", qty: 1 },
            { product_id: "pilates-ring", qty: 1 },
            { product_id: "pilates-ball", qty: 1 },
            { product_id: "capsule-1kg", qty: 1 },
        ],
    },
    "pilates-sculpt-kit": {
        id: "pilates-sculpt-kit",
        preorder: true, // can be ordered while a piece is out of stock; ships at restock
        name: "Pilates Sculpt Kit",
        price_paise: 749900, mrp_paise: 849600, // kit price; mrp = pieces bought separately
        noCodes: true, // discount codes don't stack on kits
        components: [
            { product_id: "pilates-ring", qty: 1 },
            { product_id: "pilates-ball", qty: 1 },
            { product_id: "capsule-1kg", qty: 1 },
            { product_id: "ankle-weights-2lb", qty: 1 },
        ],
    },
    "pilates-complete-kit": {
        id: "pilates-complete-kit",
        preorder: true, // can be ordered while a piece is out of stock; ships at restock
        name: "Pilates Complete Kit",
        price_paise: 1219900, mrp_paise: 1439400, // kit price; mrp = pieces bought separately
        noCodes: true, // discount codes don't stack on kits
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

module.exports = { KIT_MAP, PREORDER_SHIPS };