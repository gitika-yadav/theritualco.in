-- Checkouts started (email entered) — used for the one-time abandoned-cart reminder.
create table if not exists public.checkout_sessions (
    id           uuid primary key default gen_random_uuid(),
    token        text not null unique,
    email        text not null,
    name         text,
    phone        text,
    items        jsonb not null default '[]'::jsonb,
    total        integer not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    reminded_at  timestamptz,
    converted_at timestamptz
);
create index if not exists checkout_sessions_due_idx   on public.checkout_sessions (updated_at) where reminded_at is null and converted_at is null;
create index if not exists checkout_sessions_email_idx on public.checkout_sessions (email);

-- Only Netlify functions (service key) touch this table; no public access.
alter table public.checkout_sessions enable row level security;
