-- Event pool: opened stock set aside for events (kept separate from website stock).
-- Each row is a movement: +qty added to the pool, -qty taken out (e.g. moved back, written off).
-- Available in pool per product+colour = sum(event_pool_moves.qty)
--                                       - sum(event_inventory.qty_leased)
--                                       + sum(event_inventory.qty_returned)
-- (damaged and missing pieces never come back, so they leave the pool.)
create table if not exists event_pool_moves (
    id           bigserial primary key,
    product_id   text not null,
    product_name text not null,
    color        text not null,
    qty          integer not null check (qty <> 0),
    note         text,
    created_at   timestamptz not null default now()
);
create index if not exists event_pool_moves_product_idx on event_pool_moves (product_id, color);
alter table event_pool_moves enable row level security;
