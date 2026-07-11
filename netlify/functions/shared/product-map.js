// netlify/functions/_shared/product-map.js
// Single source of truth for product IDs, names, and weight labels.
// Both create-order.js and create-creator-order.js require() this file.
// IMPORTANT: whenever a new product is added to /css/product-page.css pages
// and to the Supabase `inventory` table, it must also be added here —
// otherwise resolveProductKey() will return null and the item will be
// silently skipped (this caused the "No valid items in cart" bug).

const PRODUCT_MAP = {
    "capsule-1kg":       { id: "capsule-1kg",       name: "Capsule Dumbbells", weight: "1 KG" },
    "capsule-2kg":       { id: "capsule-2kg",       name: "Capsule Dumbbells", weight: "2 KG" },
    "yoga-belt":         { id: "yoga-belt",         name: "The Ritual Belt",  weight: "96in" },
    "yoga-block":        { id: "yoga-block",        name: "The Ritual Block", weight: "9x6x3in" },
    "yoga-mat-5mm":      { id: "yoga-mat-5mm",      name: "The Ritual Mat",   weight: "5mm" },
    "ankle-weights-2lb": { id: "ankle-weights-2lb", name: "The Ritual Cuffs", weight: "2lb" },
};

function resolveProductKey(item) {
    if (item.id === "capsule-dumbbell") {
        const w = (item.weight || "").toLowerCase();
        if (w === "1kg") return "capsule-1kg";
        if (w === "2kg") return "capsule-2kg";
        return null;
    }
    return item.id;
}

module.exports = { PRODUCT_MAP, resolveProductKey };