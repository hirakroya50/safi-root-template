-- Shared tables for every client SPA.
-- In the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Run this once per client project. The React app stays the same.
--
-- Sign-in lives in auth.users (Supabase Auth).
-- profiles holds the shop fields: role, name, email, phone.
-- products are the menu or catalog.
-- orders plus order_items store each purchase. A separate line table
-- keeps quantity and the price at the time of the order.
--
-- Roles: admin, manager, member.
-- The first account created becomes admin. Later accounts are members.
-- An admin can change roles in the profiles table.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'manager', 'member')),
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  quantity integer not null default 0 check (quantity >= 0),
  price numeric(12, 2) not null check (price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'preparing', 'out_for_delivery', 'delivered', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  title text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0)
);

create index if not exists products_user_id_idx on public.products (user_id);
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned text := 'member';
begin
  if not exists (select 1 from public.profiles) then
    assigned := 'admin';
  end if;

  insert into public.profiles (id, role, name, email, phone)
  values (
    new.id,
    assigned,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.reserve_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_id is null then
    return new;
  end if;

  update public.products
  set quantity = quantity - new.quantity
  where id = new.product_id
    and quantity >= new.quantity;

  if not found then
    raise exception 'Not enough stock';
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_reserve_stock on public.order_items;
create trigger order_items_reserve_stock
  before insert on public.order_items
  for each row execute function public.reserve_stock();

grant select, update on public.profiles to authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert on public.order_items to authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.current_role() in ('admin', 'manager'));

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role());

drop policy if exists "admin updates any profile" on public.profiles;
create policy "admin updates any profile" on public.profiles
  for update to authenticated
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "anyone reads products" on public.products;
create policy "anyone reads products" on public.products
  for select to anon, authenticated
  using (true);

drop policy if exists "managers write products" on public.products;
create policy "managers write products" on public.products
  for insert to authenticated
  with check (public.current_role() in ('admin', 'manager') and user_id = auth.uid());

drop policy if exists "managers update products" on public.products;
create policy "managers update products" on public.products
  for update to authenticated
  using (public.current_role() in ('admin', 'manager'))
  with check (public.current_role() in ('admin', 'manager'));

drop policy if exists "managers delete products" on public.products;
create policy "managers delete products" on public.products
  for delete to authenticated
  using (public.current_role() in ('admin', 'manager'));

drop policy if exists "read related orders" on public.orders;
create policy "read related orders" on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.current_role() in ('admin', 'manager'));

drop policy if exists "place own order" on public.orders;
create policy "place own order" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "managers update orders" on public.orders;
create policy "managers update orders" on public.orders
  for update to authenticated
  using (public.current_role() in ('admin', 'manager'))
  with check (public.current_role() in ('admin', 'manager'));

drop policy if exists "read related order items" on public.order_items;
create policy "read related order items" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.current_role() in ('admin', 'manager'))
    )
  );

drop policy if exists "add items to own order" on public.order_items;
create policy "add items to own order" on public.order_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.user_id = auth.uid()
    )
  );
