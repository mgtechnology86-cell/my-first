create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;

-- Profile creation + admin bootstrap (only a CONFIRMED email on the allowlist becomes admin)
create or replace function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  if new.email_confirmed_at is not null
     and exists (select 1 from public.admin_allowlist where email = lower(new.email)) then
    insert into public.user_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_auth_user();
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_auth_user();

create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), tg_op, tg_table_name, r->>'id', jsonb_build_object('name', r->>'name'));
  return coalesce(new, old);
end $$;
create trigger audit_products after insert or update or delete on public.products for each row execute function public.log_change();
create trigger audit_categories after insert or update or delete on public.categories for each row execute function public.log_change();

create or replace function public._order_summary(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', order_number, 'tracking_token', tracking_token, 'status', status,
    'payment_method', payment_method, 'payment_status', payment_status, 'delivery_method', delivery_method,
    'subtotal', subtotal, 'delivery_fee', delivery_fee, 'total', total,
    'estimated_delivery_start', estimated_delivery_start, 'estimated_delivery_end', estimated_delivery_end,
    'created_at', created_at, 'customer_name', customer_name,
    'delivery_summary', concat_ws(', ', area, city, region, country),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', product_name, 'image', product_image, 'quantity', quantity, 'unit_price', unit_price, 'line_total', line_total)) from public.order_items where order_id = o.id), '[]'::jsonb)
  ) from public.orders o where o.id = p_id
$$;

-- SECURE GUEST/CUSTOMER CHECKOUT (prices, stock, totals are all decided here, never by the browser)
create or replace function public.place_order(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c jsonb := p_payload->'customer';
  v_key text := nullif(trim(p_payload->>'idempotency_key'), '');
  v_pay text := coalesce(p_payload->>'payment_method', 'cash_on_delivery');
  v_dm text := coalesce(p_payload->>'delivery_method', 'delivery');
  v_name text := trim(coalesce(c->>'name',''));
  v_email text := lower(trim(coalesce(c->>'email','')));
  v_phone text := trim(coalesce(c->>'phone',''));
  v_country text := coalesce(nullif(trim(c->>'country'),''), 'Ghana');
  v_region text := trim(coalesce(c->>'region',''));
  v_city text := trim(coalesce(c->>'city',''));
  v_address text := trim(coalesce(c->>'address',''));
  v_req date;
  v_order_id uuid; v_number text; v_token text;
  v_subtotal numeric(12,2) := 0; v_fee numeric(12,2) := 0;
  v_min int := 0; v_max int := 0; v_pmax numeric(12,2) := 0;
  v_pmin_days int := 0; v_pmax_days int := 0;
  rec record; e jsonb; p public.products%rowtype; v_price numeric(12,2); v_img text;
  s public.delivery_settings%rowtype;
begin
  if v_name = '' or char_length(v_name) > 120 then raise exception 'Please enter your full name.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then raise exception 'Please enter a valid email address.'; end if;
  if v_phone !~ '^[0-9+()\s-]{7,20}$' then raise exception 'Please enter a valid telephone number.'; end if;
  if v_region = '' or v_city = '' then raise exception 'Please enter your region and city or town.'; end if;
  if v_dm = 'delivery' and char_length(v_address) < 5 then raise exception 'Please enter your delivery address or directions.'; end if;
  if v_dm not in ('delivery','pickup') then raise exception 'Invalid delivery method.'; end if;
  if v_pay not in ('cash_on_delivery','manual_payment') then raise exception 'Invalid payment method.'; end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') = 0 then raise exception 'Your cart is empty.'; end if;
  if jsonb_array_length(p_payload->'items') > 50 then raise exception 'Too many items in one order.'; end if;
  begin v_req := nullif(c->>'requested_delivery_date','')::date; exception when others then raise exception 'Invalid requested delivery date.'; end;
  if v_req is not null and v_req < current_date then raise exception 'Requested delivery date cannot be in the past.'; end if;

  for e in select * from jsonb_array_elements(p_payload->'items') loop
    if coalesce(e->>'product_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invalid product in cart.'; end if;
    if coalesce(e->>'quantity','') !~ '^[0-9]{1,3}$' or (e->>'quantity')::int < 1 then raise exception 'Invalid quantity in cart.'; end if;
  end loop;

  if v_key is not null then
    select id into v_order_id from public.orders where idempotency_key = v_key;
    if found then return public._order_summary(v_order_id); end if;
  end if;

  v_number := 'MGM-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  begin
    insert into public.orders(order_number, tracking_token, idempotency_key, user_id, is_guest,
      customer_name, customer_email, customer_phone, country, region, city, area, address, landmark,
      delivery_instructions, seller_message, delivery_method, requested_delivery_date, payment_method)
    values (v_number, v_token, v_key, auth.uid(), auth.uid() is null,
      v_name, v_email, v_phone, v_country, v_region, v_city, nullif(trim(c->>'area'),''),
      case when v_dm = 'pickup' and v_address = '' then 'Pickup' else v_address end,
      nullif(trim(c->>'landmark'),''), nullif(trim(c->>'instructions'),''), nullif(trim(c->>'message'),''),
      v_dm, v_req, v_pay)
    returning id into v_order_id;
  exception when unique_violation then
    select id into v_order_id from public.orders where idempotency_key = v_key;
    if v_order_id is not null then return public._order_summary(v_order_id); end if;
    raise;
  end;

  for rec in
    select (x->>'product_id')::uuid as pid, sum((x->>'quantity')::int)::int as qty
    from jsonb_array_elements(p_payload->'items') x group by 1 order by 1
  loop
    select * into p from public.products where id = rec.pid for update;
    if not found or p.status <> 'published' then raise exception 'A product in your cart is no longer available.'; end if;
    if p.is_sold_out or p.stock < rec.qty then
      raise exception 'Sorry, only % unit(s) of "%" are available.', greatest(p.stock,0), p.name;
    end if;
    v_price := coalesce(p.discount_price, p.price);
    select url into v_img from public.product_images where product_id = p.id order by is_primary desc, sort_order, created_at limit 1;
    insert into public.order_items(order_id, product_id, product_name, product_image, unit_price, quantity, line_total)
    values (v_order_id, p.id, p.name, v_img, v_price, rec.qty, v_price * rec.qty);
    update public.products set stock = stock - rec.qty,
      is_sold_out = (stock - rec.qty) <= 0 or is_sold_out where id = p.id;
    v_subtotal := v_subtotal + v_price * rec.qty;
    v_pmax := greatest(v_pmax, p.delivery_fee);
    v_pmin_days := greatest(v_pmin_days, p.delivery_days_min);
    v_pmax_days := greatest(v_pmax_days, p.delivery_days_max);
  end loop;

  if v_dm = 'pickup' then
    select * into s from public.delivery_settings where is_active and method = 'pickup' limit 1;
    if not found then raise exception 'Local pickup is not available.'; end if;
    v_fee := 0; v_min := s.days_min; v_max := s.days_max;
  else
    select * into s from public.delivery_settings
      where is_active and method = 'delivery'
        and (area is null or lower(area) in (lower(v_city), lower(v_region)))
      order by case when lower(area) = lower(v_city) then 0 when lower(area) = lower(v_region) then 1 else 2 end
      limit 1;
    if found then v_fee := s.fee; v_min := s.days_min; v_max := s.days_max;
    else v_fee := v_pmax; v_min := v_pmin_days; v_max := v_pmax_days; end if;
  end if;

  update public.orders set subtotal = v_subtotal, delivery_fee = v_fee, total = v_subtotal + v_fee,
    estimated_delivery_start = current_date + v_min, estimated_delivery_end = current_date + v_max
  where id = v_order_id;
  insert into public.order_status_history(order_id, status, note, created_by)
  values (v_order_id, 'pending_confirmation', 'Order received', auth.uid());
  return public._order_summary(v_order_id);
end $$;

create or replace function public.track_order(p_order_number text, p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid; r jsonb;
begin
  select id into v_id from public.orders
   where order_number = upper(trim(p_order_number)) and tracking_token = trim(p_token);
  if v_id is null then return null; end if;
  r := public._order_summary(v_id);
  return r || jsonb_build_object('history', coalesce((
    select jsonb_agg(jsonb_build_object('status', status, 'note', note, 'created_at', created_at) order by created_at)
    from public.order_status_history where order_id = v_id), '[]'::jsonb));
end $$;

create or replace function public.submit_comment(p_product_id uuid, p_name text, p_email text, p_message text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := trim(regexp_replace(coalesce(p_name,''), '<[^>]*>', '', 'g'));
        v_msg text := trim(regexp_replace(coalesce(p_message,''), '<[^>]*>', '', 'g'));
        v_email text := nullif(lower(trim(coalesce(p_email,''))), '');
begin
  if v_name = '' or char_length(v_name) > 60 then raise exception 'Please enter a display name (max 60 characters).'; end if;
  if char_length(v_msg) < 2 or char_length(v_msg) > 1000 then raise exception 'Your message must be 2 to 1000 characters.'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please enter a valid email address.'; end if;
  if not exists (select 1 from public.products where id = p_product_id and status = 'published') then raise exception 'Product not found.'; end if;
  if v_email is not null and (select count(*) from public.product_comments where lower(email) = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages. Please try again later.'; end if;
  insert into public.product_comments(product_id, user_id, display_name, email, message)
  values (p_product_id, auth.uid(), v_name, v_email, v_msg);
end $$;

create or replace function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total_products', (select count(*) from public.products),
    'published_products', (select count(*) from public.products where status = 'published'),
    'unpublished_products', (select count(*) from public.products where status <> 'published'),
    'total_orders', (select count(*) from public.orders),
    'new_orders', (select count(*) from public.orders where created_at > now() - interval '24 hours'),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from public.orders group by status) s),
    'completed_sales', (select coalesce(sum(total), 0) from public.orders where status = 'delivered'),
    'unanswered_questions', (select count(*) from public.product_comments c where not exists (select 1 from public.comment_replies r where r.comment_id = c.id)),
    'low_stock', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'stock', stock) order by stock), '[]'::jsonb) from public.products where stock <= 5 and status <> 'draft')
  );
end $$;

create or replace function public.admin_update_order(
  p_order_id uuid, p_status text default null, p_note text default null, p_internal_note text default null,
  p_est_start date default null, p_est_end date default null, p_payment_status text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found.'; end if;
  if p_status is not null and p_status <> o.status then
    if p_status not in ('pending_confirmation','confirmed','preparing','ready_for_dispatch','dispatched','delivered','cancelled') then raise exception 'Invalid status.'; end if;
    if o.status = 'cancelled' then raise exception 'A cancelled order cannot be reopened.'; end if;
    if p_status = 'cancelled' then
      update public.products p set stock = p.stock + i.quantity, is_sold_out = false
        from public.order_items i where i.order_id = o.id and i.product_id = p.id;
    end if;
    update public.orders set status = p_status where id = o.id;
    insert into public.order_status_history(order_id, status, note, created_by) values (o.id, p_status, p_note, auth.uid());
  elsif p_note is not null and p_note <> '' then
    insert into public.order_status_history(order_id, status, note, created_by) values (o.id, o.status, p_note, auth.uid());
  end if;
  if p_est_start is not null or p_est_end is not null then
    update public.orders set estimated_delivery_start = coalesce(p_est_start, estimated_delivery_start),
      estimated_delivery_end = coalesce(p_est_end, p_est_start, estimated_delivery_end) where id = o.id;
  end if;
  if p_payment_status is not null and p_payment_status <> o.payment_status then
    if p_payment_status not in ('unpaid','pending','paid','refunded','failed') then raise exception 'Invalid payment status.'; end if;
    update public.orders set payment_status = p_payment_status where id = o.id;
    insert into public.payment_records(order_id, method, amount, status, created_by) values (o.id, o.payment_method, o.total, p_payment_status, auth.uid());
  end if;
  if p_internal_note is not null and p_internal_note <> '' then
    insert into public.order_notes(order_id, note, created_by) values (o.id, p_internal_note, auth.uid());
  end if;
  insert into public.audit_logs(actor_id, action, entity, entity_id, details)
  values (auth.uid(), 'order_update', 'orders', o.id::text, jsonb_build_object('status', p_status, 'payment_status', p_payment_status));
  return public._order_summary(o.id);
end $$;

create or replace function public.admin_profit_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'Not authorized' using errcode = '42501'; end if;
  with sold as (
    select i.product_id, sum(i.quantity) units, sum(i.line_total) revenue
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.status <> 'cancelled' and i.product_id is not null group by i.product_id
  ), rows_ as (
    select p.id, p.name, p.stock, coalesce(p.discount_price, p.price) as selling_price, c.purchase_cost,
      case when c.purchase_cost is null then null else coalesce(p.discount_price, p.price) - c.purchase_cost end as profit_per_unit,
      coalesce(s.units, 0) as units_sold, coalesce(s.revenue, 0) as revenue,
      case when c.purchase_cost is null then null else coalesce(s.revenue, 0) - coalesce(s.units, 0) * c.purchase_cost end as profit_realised
    from public.products p left join public.product_costs c on c.product_id = p.id left join sold s on s.product_id = p.id
  )
  select jsonb_build_object(
    'products', coalesce(jsonb_agg(to_jsonb(rows_) order by name), '[]'::jsonb),
    'inventory_purchase_cost', coalesce(sum(purchase_cost * stock), 0),
    'sales_total', (select coalesce(sum(total), 0) from public.orders where status <> 'cancelled'),
    'estimated_profit', coalesce(sum(profit_realised), 0)
  ) into r from rows_;
  return r;
end $$;

revoke all on function public._order_summary(uuid) from public, anon, authenticated;
revoke all on function public.place_order(jsonb) from public;
revoke all on function public.track_order(text, text) from public;
revoke all on function public.submit_comment(uuid, text, text, text) from public;
revoke all on function public.admin_dashboard_stats() from public, anon;
revoke all on function public.admin_update_order(uuid, text, text, text, date, date, text) from public, anon;
revoke all on function public.admin_profit_report() from public, anon;
revoke all on function public.is_admin() from public;
grant execute on function public.place_order(jsonb) to anon, authenticated;
grant execute on function public.track_order(text, text) to anon, authenticated;
grant execute on function public.submit_comment(uuid, text, text, text) to anon, authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_update_order(uuid, text, text, text, date, date, text) to authenticated;
grant execute on function public.admin_profit_report() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
