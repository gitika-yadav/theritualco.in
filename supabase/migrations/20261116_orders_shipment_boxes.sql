-- Multi-box (Delhivery MPS) orders: every box's waybill, master first.
-- orders.tracking_number keeps the master waybill (used for tracking + emails).
alter table orders add column if not exists shipment_boxes jsonb;
