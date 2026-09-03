-- ════════════════════════════════════════════════════════════════
-- THE RITUAL CO. — RESET inventory_test (fix duplicates)
--
-- Drops & recreates the test table cleanly, adds a UNIQUE constraint on
-- (product_id, color) so it can NEVER be duplicated again, re-seeds 3 rows,
-- and recreates the test RPC. Safe: only touches inventory_test.
--
-- RUN THIS ONCE. Then re-run Tests A-E from instructions.
-- ════════════════════════════════════════════════════════════════

-- 1. Drop the function + table so we start completely fresh
DROP FUNCTION IF EXISTS public.increment_sold_test;
DROP TABLE IF EXISTS public.inventory_test;

-- 2. Recreate the test table (mirror of production `inventory`)
CREATE TABLE public.inventory_test (
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

-- 3. Unique constraint: one row per product + color (prevents duplicates forever)
ALTER TABLE public.inventory_test
  ADD CONSTRAINT inventory_test_product_color_unique
  UNIQUE (product_id, color);

-- 4. Seed the 3 rows
INSERT INTO public.inventory_test
    (product_id, product_name, color, stock, sold, active, early_bird_limit, early_bird_price_paise, price_paise)
VALUES
    ('capsule-1kg', 'Capsule Dumbbells', 'Cream',  5,  45, true,  50, 349900, 499900),
    ('capsule-1kg', 'Capsule Dumbbells', 'Black',  0,  50, true,  50, 349900, 499900),
    ('yoga-belt',   'The Ritual Belt',   'default', 200, 10, true, 50, 149900, 199900)
ON CONFLICT (product_id, color) DO NOTHING;

-- 5. Recreate the test RPC
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

-- 6. Verify: should be EXACTLY 3 rows (one per product+color)
SELECT product_id, color, stock, sold
FROM public.inventory_test
ORDER BY product_id, color;
