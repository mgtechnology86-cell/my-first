-- MGM (MG MARKET) core schema
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text,
  country text default 'Ghana', region text, city text, area text, address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);
create table public.admin_allowlist (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 200),
  description text not null default '',
  short_description text,
  price numeric(12,2) not null check (price >= 0),
  discount_price numeric(12,2) check (discount_price is null or (discount_price >= 0 and discount_price < price)),
  category_id uuid references public.categories(id) on delete set null,
  stock integer not null default 0 check (stock >= 0),
  condition text not null default 'new' check (condition in ('new','used','refurbished')),
  specifications jsonb not null default '{}'::jsonb,
  location text,
  sku text unique,
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  delivery_days_min integer not null default 1 check (delivery_days_min >= 0),
  delivery_days_max integer not null default 5 check (delivery_days_max >= delivery_days_min),
  status text not null default 'draft' check (status in ('draft','published','unpublished')),
  is_featured boolean not null default false,
  is_sold_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_status_idx on public.products(status, created_at desc);
create index products_category_idx on public.products(category_id);
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();

-- Private purchase cost (never readable by the public)
create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  purchase_cost numeric(12,2) not null check (purchase_cost >= 0),
  updated_at timestamptz not null default now()
);
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  storage_path text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id, sort_order);
create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create table public.delivery_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  method text not null default 'delivery' check (method in ('delivery','pickup')),
  area text,  -- region or city this rule applies to; null = default rule
  fee numeric(12,2) not null default 0 check (fee >= 0),
  days_min integer not null default 1 check (days_min >= 0),
  days_max integer not null default 5 check (days_max >= days_min),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create sequence public.order_number_seq start 1001;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  tracking_token text not null unique,
  idempotency_key text unique,
  user_id uuid references auth.users(id) on delete set null,
  is_guest boolean not null default true,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  country text not null default 'Ghana',
  region text not null, city text not null, area text,
  address text not null, landmark text,
  delivery_instructions text, seller_message text,
  delivery_method text not null default 'delivery' check (delivery_method in ('delivery','pickup')),
  requested_delivery_date date,
  estimated_delivery_start date, estimated_delivery_end date,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  payment_method text not null default 'cash_on_delivery' check (payment_method in ('cash_on_delivery','manual_payment')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded','failed')),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','confirmed','preparing','ready_for_dispatch','dispatched','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_created_idx on public.orders(created_at desc);
create index orders_status_idx on public.orders(status);
create index orders_user_idx on public.orders(user_id);
create index orders_email_idx on public.orders(lower(customer_email));
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_image text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
create index order_items_order_idx on public.order_items(order_id);
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,  -- customer-visible
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_history_order_idx on public.order_status_history(order_id, created_at);
create table public.order_notes (  -- admin-only internal notes
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null check (amount >= 0),
  status text not null,
  reference text, note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.product_comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  email text,  -- private
  message text not null check (char_length(message) between 2 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at timestamptz not null default now()
);
create index product_comments_product_idx on public.product_comments(product_id, status);
create table public.comment_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.product_comments(id) on delete cascade,
  reply text not null check (char_length(reply) between 1 and 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.business_settings (
  key text primary key,
  value jsonb not null default '""'::jsonb,
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Seed: admin allowlist, suggested categories, business settings (no invented contact details)
insert into public.admin_allowlist(email) values ('mgcowbell@gmail.com');
insert into public.categories(name, slug, sort_order) values
 ('Phones and Accessories','phones-and-accessories',1),('Electronics','electronics',2),('Fashion and Clothing','fashion-and-clothing',3),
 ('Shoes','shoes',4),('Bags','bags',5),('Watches and Jewelry','watches-and-jewelry',6),('Home and Living','home-and-living',7),
 ('Beauty and Personal Care','beauty-and-personal-care',8),('Computers and Accessories','computers-and-accessories',9),
 ('Sports and Fitness','sports-and-fitness',10),('Kitchen Products','kitchen-products',11),('Other Products','other-products',12);
insert into public.business_settings(key, value, is_public) values
 ('business_name','"MGM (MG MARKET)"',true),('brand_name','"MGM"',true),('tagline','"BUY • SELL • DISCOVER"',true),('owner','"MGCOWBELL"',true),
 ('country','"Ghana"',true),('currency_code','"GHS"',true),('currency_symbol','"GH₵"',true),('contact_phone','""',true),('whatsapp_number','""',true),
 ('contact_email','""',true),('business_address','""',true),('payment_instructions','""',true),('delivery_notes','""',true),('about','""',true);
