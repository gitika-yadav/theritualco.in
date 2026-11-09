-- Reverse of restock_item: used when "Received back" was clicked by mistake.
create or replace function public.unrestock_item(p_product_id text, p_color text, p_qty integer default 1)
returns boolean language plpgsql security definer as $$
begin
  update public.inventory
     set stock = greatest(stock - p_qty, 0),
         sold  = sold + p_qty
   where product_id = p_product_id
     and lower(color) = lower(coalesce(p_color, 'default'));
  return found;
end;
$$;
revoke all on function public.unrestock_item(text, text, integer) from public, anon, authenticated;
