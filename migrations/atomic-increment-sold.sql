-- ════════════════════════════════════════════════════════════════
-- THE RITUAL CO. — Atomic stock guard migration
-- Run this ONCE in the Supabase SQL editor against your project.
--
-- Replaces the plain `increment_sold` RPC with an ATOMIC version that
-- only increments `sold` while units remain (sold + qty <= total_stock).
-- This prevents overselling when two orders land at the exact same time
-- (a plain read-then-increment in app code has a race window).
--
-- Upgrading existing function (takes an extra p_qty argument):
--   create-order.js          -> supabase.rpc("increment_sold", { p_product_id, p_color, p_qty, p_slug })
--   verify-payment.js        -> same
--   create-creator-order.js  -> same
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_sold(
    p_product_id text,
    p_color text,
    p_qty integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_sold integer;
    v_result   boolean := false;
BEGIN
    UPDATE public.inventory
    SET sold = sold + p_qty
    WHERE product_id = p_product_id
      AND LOWER(color) = LOWER(COALESCE(p_color, 'default'))
      AND active = true
      AND sold + p_qty <= total_stock
    RETURNING sold INTO v_new_sold;

    IF FOUND THEN
        v_result := true;
    END IF;

    RETURN v_result;
END;
$$;
