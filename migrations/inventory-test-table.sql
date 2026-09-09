-- ════════════════════════════════════════════════════════════════
-- THE RITUAL CO. — Inventory TEST table (safe playground)
--
-- Purpose: test stock-guard / increment_sold behaviour WITHOUT touching
-- the production `inventory` table. Mirrors production schema exactly.
--
-- Run this ONCE in the Supabase SQL editor against your project.
-- ── change `inventory` → `inventory_test` is intentional ──
-- ════════════════════════════════════════════════════════════════

-- 1. Test table (mirror of production `inventory`)
CREATE TABLE IF NOT EXISTS public.inventory_test (
    id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id               text NOT NULL,
    product_name             text,
    color                    text NOT NULL DEFAULT 'default',
    stock                    integer NOT NULL DEFAULT 0,
    sold                     integer NOT NULL DEFAULT 0,
    active                   boolean NOT NULL DEFAULT true,
    early_bird_limit         integer NOT NULL DEFAULT 0,
    early_bird_price_paise   integer NOT NULL DEFAULT 0,
    price_paise              integer NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now()
);

-- 2. Seed rows matching real product IDs (from netlify/functions/shared/product-map.js)
INSERT INTO public.inventory_test
    (product_id, product_name, color, stock, sold, active, early_bird_limit, early_bird_price_paise, price_paise)
VALUES
    -- low stock of 5 -> test "only N left" and accepting qty <= 5
    ('capsule-1kg', 'Capsule Dumbbells', 'Cream',  5,  45, true,  50, 349900, 499900),
    -- 0 stock   -> test oversell rejection + out-of-stock state
    ('capsule-1kg', 'Capsule Dumbbells', 'Black',  0,  50, true,  50, 349900, 499900),
    -- plenty    -> test high-qty order is allowed
    ('yoga-belt',   'The Ritual Belt',   'default', 200, 10, true, 50, 149900, 199900)
ON CONFLICT DO NOTHING;

-- 3. Test RPC (mirror of production increment_sold, but on inventory_test)
CREATE OR REPLACE FUNCTION public.increment_sold_test(
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
    UPDATE public.inventory_test
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

-- 4. Sanity check
SELECT product_id, color, stock, sold FROM public.inventory_test ORDER BY product_id, color;