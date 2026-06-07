
// netlify/functions/get-reviews.js
// Fetches approved reviews from Supabase server-side (keys never exposed to browser)

const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
    const db = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );

    const { data, error } = await db
        .from('reviews')
        .select('id, name, product, rating, body, created_at')
        .eq('approved', true)
        .order('created_at', { ascending: false });

    if (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not fetch reviews' })
        };
    }

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    };
};