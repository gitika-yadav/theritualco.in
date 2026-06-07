// netlify/functions/submit-review.js
// Saves a new review to Supabase server-side (keys never exposed to browser)

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { name, product, rating, body: reviewBody } = body;

    // Basic server-side validation
    if (!name || !reviewBody || !rating) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'name, rating, and body are required' })
        };
    }
    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'rating must be between 1 and 5' })
        };
    }
    if (name.length > 80 || reviewBody.length > 1000) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Input too long' })
        };
    }

    const db = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY  // service role used only server-side
    );

    const { error } = await db.from('reviews').insert({
        name: name.trim(),
        product: product ? product.trim() : null,
        rating,
        body: reviewBody.trim(),
        approved: false
    });

    if (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Could not save review' })
        };
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
    };
};