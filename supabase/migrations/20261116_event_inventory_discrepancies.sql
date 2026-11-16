-- Event stock: record pieces that came back damaged or never came back.
-- qty_returned = pieces back in good condition.
alter table event_inventory
    add column if not exists qty_damaged integer not null default 0,
    add column if not exists qty_missing integer not null default 0,
    add column if not exists return_note text;
