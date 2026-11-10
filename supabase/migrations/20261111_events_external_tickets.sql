-- Events listed on our site whose tickets are sold by a partner/organiser.
-- When ticket_url is set, the event page links out instead of taking bookings.
alter table events add column if not exists ticket_url text;
alter table events add column if not exists host_name text;
