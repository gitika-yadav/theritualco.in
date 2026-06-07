const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY  // anon key is fine — inventory is public read
);

exports.handler = async (event) => {
    const { data, error } = await supabase
        .from("inventory")
        .select("product_id, sold, early_bird_limit, early_bird_price_paise, price_paise, active")
        .eq("active", true);

    if (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    // Return remaining early bird slots per product
    const inventory = {};
    for (const row of data) {
        inventory[row.product_id] = {
            slots_remaining: Math.max(0, row.early_bird_limit - row.sold),
            is_early_bird: row.sold < row.early_bird_limit,
            early_bird_price: row.early_bird_price_paise / 100,
            regular_price: row.price_paise / 100,
            active: row.active,
        };
    }

    return {
        statusCode: 200,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify(inventory),
    };
};