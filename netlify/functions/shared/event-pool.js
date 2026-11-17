// Event pool maths, shared by event-inventory.js and create-creator-order.js.
// Pool = sum(pool moves) − (leased − returned) across all event rows.
// Damaged / missing pieces stay "leased but not returned", so they leave the pool.

// Pieces of one product+colour sitting in the pool right now (not at an event, not lost).
async function poolAvailable(supabase, product_id, color) {
    const [moves, ev] = await Promise.all([
        supabase.from("event_pool_moves").select("qty").eq("product_id", product_id).eq("color", color),
        supabase.from("event_inventory").select("qty_leased, qty_returned").eq("product_id", product_id).eq("color", color),
    ]);
    if (moves.error) throw new Error(moves.error.message);
    if (ev.error) throw new Error(ev.error.message);
    const added = moves.data.reduce((s, m) => s + m.qty, 0);
    const net = ev.data.reduce((s, e) => s + e.qty_leased - e.qty_returned, 0);
    return added - net;
}

// Whole pool as { product_id: { color: n } } plus recent event names.
async function poolSnapshot(supabase) {
    const [moves, ev] = await Promise.all([
        supabase.from("event_pool_moves").select("product_id, color, qty"),
        supabase.from("event_inventory").select("event_name, product_id, color, qty_leased, qty_returned, date_out").order("date_out", { ascending: false }),
    ]);
    if (moves.error) throw new Error(moves.error.message);
    if (ev.error) throw new Error(ev.error.message);
    const pool = {};
    const bump = (p, c, n) => { pool[p] = pool[p] || {}; pool[p][c] = (pool[p][c] || 0) + n; };
    moves.data.forEach(m => bump(m.product_id, m.color, m.qty));
    ev.data.forEach(e => bump(e.product_id, e.color, -(e.qty_leased - e.qty_returned)));
    const events = [...new Set(ev.data.map(e => e.event_name))].slice(0, 15);
    return { pool, events };
}

module.exports = { poolAvailable, poolSnapshot };
