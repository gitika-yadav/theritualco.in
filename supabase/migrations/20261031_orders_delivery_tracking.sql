-- Delivery tracking + review request bookkeeping (used by delhivery-sync).
alter table public.orders
  add column if not exists delivery_status text,
  add column if not exists delivery_checked_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists review_requested_at timestamptz;
