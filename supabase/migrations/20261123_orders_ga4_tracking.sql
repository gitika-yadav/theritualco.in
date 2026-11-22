-- GA4 server-side tracking: browser ids captured at checkout, and send markers
alter table public.orders
  add column if not exists ga_client_id text,
  add column if not exists ga_session_id text,
  add column if not exists ga_skip boolean not null default false,
  add column if not exists ga_purchase_sent_at timestamptz,
  add column if not exists ga_refund_sent_at timestamptz;
