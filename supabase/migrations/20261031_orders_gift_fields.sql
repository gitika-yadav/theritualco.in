-- Gift orders: recipient name/phone for the parcel, message for the card.
alter table public.orders
  add column if not exists is_gift boolean not null default false,
  add column if not exists gift_recipient text,
  add column if not exists gift_recipient_phone text,
  add column if not exists gift_message text;
