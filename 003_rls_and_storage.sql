alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_allowlist enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_costs enable row level security;
alter table public.product_images enable row level security;
alter table public.favorites enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_notes enable row level security;
alter table public.payment_records enable row level security;
alter table public.product_comments enable row level security;
alter table public.comment_replies enable row level security;
alter table public.business_settings enable row level security;
alter table public.audit_logs enable row level security;

revoke insert, update, delete on public.user_roles from anon, authenticated;
create policy "own role readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create policy "admin all" on public.admin_allowlist for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.product_costs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.order_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin all" on public.payment_records for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin read" on public.audit_logs for select to authenticated using (public.is_admin());

create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "public active categories" on public.categories for select to anon, authenticated using (is_active or public.is_admin());
create policy "admin manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public published products" on public.products for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy "admin manage products" on public.products for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public product images" on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'published') or public.is_admin());
create policy "admin manage images" on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "own favorites" on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "public delivery rules" on public.delivery_settings for select to anon, authenticated using (is_active or public.is_admin());
create policy "admin manage delivery" on public.delivery_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public business settings" on public.business_settings for select to anon, authenticated using (is_public or public.is_admin());
create policy "admin manage settings" on public.business_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Orders are created ONLY through place_order(); customers read their own; admin manages
create policy "own or admin orders" on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin update orders" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "own or admin items" on public.order_items for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "own or admin history" on public.order_status_history for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
revoke insert, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;
revoke insert, update, delete on public.order_status_history from anon, authenticated;
revoke all on public.orders from anon;
revoke all on public.order_items from anon;
revoke all on public.order_status_history from anon;
revoke all on public.product_costs, public.order_notes, public.payment_records, public.audit_logs, public.admin_allowlist, public.user_roles from anon;
revoke all on public.profiles, public.favorites from anon;

create policy "admin manage comments" on public.product_comments for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.product_comments from anon;
create policy "admin manage replies" on public.comment_replies for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.comment_replies from anon;

create view public.product_comments_public as
select c.id, c.product_id, c.display_name, c.message, c.created_at,
  coalesce((select jsonb_agg(jsonb_build_object('reply', r.reply, 'created_at', r.created_at) order by r.created_at)
            from public.comment_replies r where r.comment_id = c.id), '[]'::jsonb) as replies
from public.product_comments c
where c.status = 'approved'
  and exists (select 1 from public.products p where p.id = c.product_id and p.status = 'published');
grant select on public.product_comments_public to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "public read product images" on storage.objects for select to anon, authenticated using (bucket_id = 'product-images');
create policy "admin upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy "admin update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and public.is_admin());
create policy "admin delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

alter publication supabase_realtime add table public.orders, public.product_comments;
