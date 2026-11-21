-- Private link token for the gift "digital unwrap" page (/gift?t=...)
alter table public.orders add column if not exists gift_token text;
create unique index if not exists orders_gift_token_key on public.orders (gift_token) where gift_token is not null;
