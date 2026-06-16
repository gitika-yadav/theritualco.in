const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Get auth token from header
    const authHeader = event.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) return { statusCode: 401, body: "Unauthorized" };

    // Verify the user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, body: "Unauthorized" };

    // Fetch orders by user_id OR by guest_email matching user's email
    const { data: orders, error } = await supabase
        .from("orders")
        .select("*")
        .or(`user_id.eq.${user.id},guest_email.eq.${user.email}`)
        .order("created_at", { ascending: false });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    return { statusCode: 200, body: JSON.stringify({ orders }) };
};