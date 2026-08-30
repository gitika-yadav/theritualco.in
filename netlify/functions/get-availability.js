// netlify/functions/get-availability.js
// Public read-only endpoint. Returns, per product (+ colour), whether the
// item is in stock or sold out, based on the live `inventory` table:
//
//   stock available  -> sold < total_stock   (still units left)
//   SOLD OUT         -> sold >= total_stock   (restock = raise total_stock in DB)
//
// Only `active` rows are considered. Output shape:
//   {
//     "capsule-1kg": {
//        "cream":   { in_stock: true,  sold: 0, total_stock: 100, color: "Cream" },
//        "black":   { in_stock: true,  sold: 0, total_stock: 100, color: "Black" }
//     },
//     "...": { ... }
//   }
//
// Colour keys are normalised to lowercase so the front-end can look them up
// without worrying about "Cream" vs "cream".

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY // anon key is fine - availability is public read
);

exports.handler = async (event) => {
    try {
        // Optionally filter to a single product: ?product=capsule-1kg
        const requested = event.queryStringParameters
            ? (event.queryStringParameters.product || "").trim()
            : "";

        let query = supabase
            .from("inventory")
            .select("product_id, product_name, color, total_stock, sold, active, early_bird_limit")
            .eq("active", true);

        if (requested) {
            query = query.eq("product_id", requested);
        }

        const { data, error } = await query;

        if (error) {
            console.error("get-availability error:", error);
            return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
        }

        // Build per-product, per-colour availability map
        const availability = {};
        for (const row of data || []) {
            const pid = row.product_id;
            const color = String(row.color || "default").toLowerCase().trim().replace(/\s+/g, "");

            if (!availability[pid]) availability[pid] = { in_stock: false, colors: {} };

            const total = Number(row.total_stock) || 0;
            const sold = Number(row.sold) || 0;
            const inStock = sold < total;

            availability[pid].colors[color] = {
                in_stock: inStock,
                sold: sold,
                total_stock: total,
                color: row.color || "default",
                early_bird: sold < Number(row.early_bird_limit || 0),
            };
            if (inStock) availability[pid].in_stock = true;
        }

        return {
            statusCode: 200,
            headers: {
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(availability),
        };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};
