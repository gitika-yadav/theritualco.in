-- Events (paid / free RSVP / invite-only) and their bookings.
create table if not exists public.events (
    id            uuid primary key default gen_random_uuid(),
    slug          text not null unique,
    title         text not null,
    subtitle      text,
    starts_at     timestamptz not null,
    ends_at       timestamptz,
    venue_name    text,
    venue_address text,
    map_url       text,
    price         integer not null default 0,        -- ₹ per ticket; 0 = free RSVP
    capacity      integer not null default 20,
    max_per_booking integer not null default 4,
    cover_image   text,
    description   text,
    includes      text,                              -- one item per line
    access        text not null default 'public' check (access in ('public','invite')),
    invite_code   text,
    status        text not null default 'draft' check (status in ('draft','published','cancelled')),
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

create table if not exists public.event_bookings (
    id                  uuid primary key default gen_random_uuid(),
    event_id            uuid not null references public.events(id) on delete cascade,
    name                text not null,
    email               text not null,
    phone               text,
    instagram           text,
    qty                 integer not null default 1 check (qty > 0),
    amount_paise        integer not null default 0,
    status              text not null default 'pending' check (status in ('pending','confirmed','cancelled','refunded')),
    source              text not null default 'web',   -- web | invite | admin
    razorpay_order_id   text unique,
    razorpay_payment_id text,
    refund_id           text,
    checked_in_at       timestamptz,
    reminded_at         timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists event_bookings_event_idx on public.event_bookings (event_id, status);

-- Only Netlify functions (service key) read/write these.
alter table public.events enable row level security;
alter table public.event_bookings enable row level security;
