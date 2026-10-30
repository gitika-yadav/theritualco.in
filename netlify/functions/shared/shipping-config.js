// netlify/functions/shared/shipping-config.js
// Packed weight + box size per product, used when creating Delhivery shipments.
//
// ⚠️  PLACEHOLDER VALUES — replace with real measurements (packed, in the box).
//     weight_g = grams, l/w/h = cm. Every value can still be edited per order
//     in the admin "Ship via Delhivery" window before the shipment is created.
//
// mrp = declared value used only when an order has ₹0 (creator gifts),
//       because Delhivery needs a shipment value.

const PICKUP_LOCATION = process.env.DELHIVERY_PICKUP || "THE RITUAL CO B2C";

const PACKAGES = {
    "yoga-mat-5mm":      { weight_g: 2500, l: 65, w: 15, h: 15, mrp: 4999 },  // TODO measure
    "ankle-weights-2lb": { weight_g: 2000, l: 25, w: 20, h: 10, mrp: 3499 },  // TODO measure
    "pilates-ball":      { weight_g: 300,  l: 20, w: 15, h: 5,  mrp: 999 },   // TODO measure
    "pilates-ring":      { weight_g: 600,  l: 40, w: 40, h: 5,  mrp: 1499 },  // TODO measure
    "grip-socks":        { weight_g: 100,  l: 20, w: 15, h: 3,  mrp: 699 },   // TODO measure
    "yoga-belt":         { weight_g: 250,  l: 20, w: 15, h: 5,  mrp: 499 },   // TODO measure
    "yoga-block":        { weight_g: 400,  l: 25, w: 16, h: 10, mrp: 999 },   // TODO measure
    "capsule-1kg":       { weight_g: 2300, l: 25, w: 15, h: 10, mrp: 2999 },  // TODO measure
    "capsule-2kg":       { weight_g: 4400, l: 25, w: 15, h: 12, mrp: 3999 },  // TODO measure
};
PACKAGES["capsule-dumbbell"] = PACKAGES["capsule-1kg"];

// Used for anything not listed above.
const FALLBACK = { weight_g: 500, l: 25, w: 20, h: 10, mrp: 999 };

module.exports = { PICKUP_LOCATION, PACKAGES, FALLBACK };
