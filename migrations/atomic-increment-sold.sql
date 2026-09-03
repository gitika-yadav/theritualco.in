-- ════════════════════════════════════════════════════════════════
-- THE RITUAL CO. — Inventory schema: stock (remaining) + sold (lifetime)
--
-- `stock`  = remaining units available to buy (decrements on sale)
-- `sold`   = lifetime units sold (increments on sale, audit trail)
-- Sold out = stock = 0. Restock = raise stock in DB.
--
-- Run this ONCE in the Supabase SQL editor against your project.
-- ════════════════════════════════════════════════════════════════

-- 1. Rename column
ALTER TABLE inventory RENAME COLUMN total_stock TO stock;

-- 2. Fix existing data: convert from "cap" to "remaining"
--    For rows already consistent (sold <= old total): stock = old_total - sold
--    For oversold rows (sold > old total): clamp to 0
UPDATE inventory SET stock = GREATEST(0, stock - sold);

-- 3. Atomic RPC: decrements stock + increments sold in one atomic update.
--    Returns false if stock is insufficient (no row modified, no oversell).
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
    v_result boolean := false;
BEGIN
    UPDATE public.inventory
    SET stock = stock - p_qty,
        sold  = sold + p_qty
    WHERE product_id = p_product_id
      AND LOWER(color) = LOWER(COALESCE(p_color, 'default'))
      AND active = true
      AND stock >= p_qty;

    IF FOUND THEN
        v_result := true;
    END IF;

    RETURN v_result;
END;
$$;
