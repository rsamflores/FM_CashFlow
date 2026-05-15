-- FM-CashFlow — schema inicial
-- Personal + Empresarial con RLS por scope y rol

create extension if not exists "pgcrypto";

-- ============================================================
-- Tipos
-- ============================================================
create type scope_t as enum ('personal', 'business');
create type role_t as enum ('owner', 'editor', 'viewer');
create type account_type_t as enum ('checking', 'savings', 'cash', 'credit_card', 'other');
create type kind_t as enum ('income', 'expense');
create type frequency_t as enum ('weekly', 'biweekly', 'monthly', 'yearly');

-- ============================================================
-- profiles
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Profiles: read own" on profiles
  for select using (auth.uid() = id);

create policy "Profiles: update own" on profiles
  for update using (auth.uid() = id);

-- Trigger: create profile row on signup
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  -- Default memberships: owner of both personal and business
  insert into public.memberships (user_id, scope, role, accepted_at)
  values (new.id, 'personal', 'owner', now()),
         (new.id, 'business', 'owner', now());
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- memberships (qué usuario tiene qué rol en qué scope)
-- ============================================================
create table memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope scope_t not null,
  role role_t not null default 'viewer',
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_id, scope)
);

alter table memberships enable row level security;

create policy "Memberships: read own" on memberships
  for select using (auth.uid() = user_id);

create policy "Memberships: owners can manage scope" on memberships
  for all using (
    exists (
      select 1 from memberships m
      where m.user_id = auth.uid()
        and m.scope = memberships.scope
        and m.role = 'owner'
        and m.accepted_at is not null
    )
  );

-- Helper: does the current user have at least the given role in scope?
create or replace function has_role(s scope_t, min_role role_t)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and scope = s
      and accepted_at is not null
      and case min_role
            when 'viewer' then role in ('viewer', 'editor', 'owner')
            when 'editor' then role in ('editor', 'owner')
            when 'owner'  then role = 'owner'
          end
  );
$$;

-- ============================================================
-- accounts
-- ============================================================
create table accounts (
  id uuid primary key default gen_random_uuid(),
  scope scope_t not null,
  name text not null,
  type account_type_t not null default 'checking',
  color text,
  icon text,
  opening_balance numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

alter table accounts enable row level security;

create policy "Accounts: read by scope members" on accounts
  for select using (has_role(scope, 'viewer'));
create policy "Accounts: editors insert" on accounts
  for insert with check (has_role(scope, 'editor'));
create policy "Accounts: editors update" on accounts
  for update using (has_role(scope, 'editor'));
create policy "Accounts: owners delete" on accounts
  for delete using (has_role(scope, 'owner'));

-- ============================================================
-- categories
-- ============================================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  scope scope_t not null,
  kind kind_t not null,
  name text not null,
  color text,
  icon text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (scope, kind, name)
);

alter table categories enable row level security;

create policy "Categories: read by scope members" on categories
  for select using (has_role(scope, 'viewer'));
create policy "Categories: editors insert" on categories
  for insert with check (has_role(scope, 'editor'));
create policy "Categories: editors update" on categories
  for update using (has_role(scope, 'editor'));
create policy "Categories: owners delete" on categories
  for delete using (has_role(scope, 'owner'));

-- ============================================================
-- planned_budgets
-- ============================================================
create table planned_budgets (
  id uuid primary key default gen_random_uuid(),
  scope scope_t not null,
  category_id uuid not null references categories(id) on delete cascade,
  period_month date not null, -- first day of the month
  expected_amount numeric(14, 2) not null,
  note text,
  created_at timestamptz not null default now(),
  unique (scope, category_id, period_month)
);

alter table planned_budgets enable row level security;

create policy "Budgets: read by scope" on planned_budgets
  for select using (has_role(scope, 'viewer'));
create policy "Budgets: editors insert" on planned_budgets
  for insert with check (has_role(scope, 'editor'));
create policy "Budgets: editors update" on planned_budgets
  for update using (has_role(scope, 'editor'));
create policy "Budgets: editors delete" on planned_budgets
  for delete using (has_role(scope, 'editor'));

-- ============================================================
-- recurring_rules
-- ============================================================
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  scope scope_t not null,
  account_id uuid not null references accounts(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  kind kind_t not null,
  amount numeric(14, 2) not null,
  description text,
  frequency frequency_t not null,
  start_date date not null,
  end_date date,
  next_run date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table recurring_rules enable row level security;

create policy "Recurring: read by scope" on recurring_rules
  for select using (has_role(scope, 'viewer'));
create policy "Recurring: editors insert" on recurring_rules
  for insert with check (has_role(scope, 'editor'));
create policy "Recurring: editors update" on recurring_rules
  for update using (has_role(scope, 'editor'));
create policy "Recurring: editors delete" on recurring_rules
  for delete using (has_role(scope, 'editor'));

-- ============================================================
-- transactions
-- ============================================================
create table transactions (
  id uuid primary key default gen_random_uuid(),
  scope scope_t not null,
  account_id uuid not null references accounts(id) on delete restrict,
  category_id uuid not null references categories(id) on delete restrict,
  kind kind_t not null,
  amount numeric(14, 2) not null check (amount >= 0),
  occurred_on date not null,
  description text,
  is_planned boolean not null default false,
  planned_budget_id uuid references planned_budgets(id) on delete set null,
  recurring_rule_id uuid references recurring_rules(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- idempotency for recurring materialization
  unique (recurring_rule_id, occurred_on)
);

create index transactions_scope_date_idx on transactions (scope, occurred_on desc);
create index transactions_account_idx on transactions (account_id);
create index transactions_category_idx on transactions (category_id);

alter table transactions enable row level security;

create policy "Transactions: read by scope" on transactions
  for select using (has_role(scope, 'viewer'));
create policy "Transactions: editors insert" on transactions
  for insert with check (has_role(scope, 'editor'));
create policy "Transactions: editors update" on transactions
  for update using (has_role(scope, 'editor'));
create policy "Transactions: editors delete" on transactions
  for delete using (has_role(scope, 'editor'));

-- ============================================================
-- Seeds: categorías por defecto (compartidas — admin las inserta una vez)
-- ============================================================
-- Estas seeds requieren ejecutarse como service_role, no via RLS.
-- Para uso inicial, los usuarios pueden crear sus propias categorías.
-- Si quieres pre-poblar, ejecuta este bloque manualmente con service_role:
/*
insert into categories (scope, kind, name, color, icon) values
  ('personal', 'income',  'Sueldo',        '#c3f400', 'payments'),
  ('personal', 'income',  'Freelance',     '#abd600', 'work'),
  ('personal', 'income',  'Inversiones',   '#4cd6ff', 'trending_up'),
  ('personal', 'income',  'Otros',         '#908fa0', 'more_horiz'),
  ('personal', 'expense', 'Comida',        '#ffb4ab', 'restaurant'),
  ('personal', 'expense', 'Vivienda',      '#4cd6ff', 'home'),
  ('personal', 'expense', 'Transporte',    '#c0c1ff', 'directions_car'),
  ('personal', 'expense', 'Salud',         '#ffb4ab', 'medical_services'),
  ('personal', 'expense', 'Entretenimiento','#c0c1ff','theaters'),
  ('personal', 'expense', 'Servicios',     '#c3f400', 'bolt'),
  ('personal', 'expense', 'Otros',         '#908fa0', 'more_horiz'),
  ('business', 'income',  'Ventas',        '#c3f400', 'sell'),
  ('business', 'income',  'Servicios',     '#abd600', 'design_services'),
  ('business', 'income',  'Inversiones',   '#4cd6ff', 'trending_up'),
  ('business', 'expense', 'Nómina',        '#ffb4ab', 'groups'),
  ('business', 'expense', 'Renta oficina', '#4cd6ff', 'business'),
  ('business', 'expense', 'Servicios',     '#c0c1ff', 'bolt'),
  ('business', 'expense', 'Impuestos',     '#ffb4ab', 'gavel'),
  ('business', 'expense', 'Marketing',     '#c0c1ff', 'campaign'),
  ('business', 'expense', 'Software',      '#4cd6ff', 'memory'),
  ('business', 'expense', 'Otros',         '#908fa0', 'more_horiz');
*/
