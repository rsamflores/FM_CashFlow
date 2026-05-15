-- Transactions need explicit confirmation for recurring income
-- Manually created transactions are confirmed by default
-- Recurring-generated income starts unconfirmed until user marks as received
alter table transactions add column is_confirmed boolean not null default true;

-- Recurring rules table (already defined in 0001 but may need to be created)
-- This is idempotent — only runs if table doesn't exist
create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  scope scope_t not null,
  account_id uuid not null references accounts(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  kind kind_t not null,
  amount numeric(14,2) not null,
  description text,
  frequency frequency_t not null default 'monthly',
  start_date date not null,
  end_date date,
  next_run date not null,
  is_active bool not null default true,
  created_at timestamptz not null default now()
);

alter table recurring_rules enable row level security;

create policy "Recurring: read by scope" on recurring_rules
  for select using (has_role(scope, 'viewer'));
create policy "Recurring: editors insert" on recurring_rules
  for insert with check (has_role(scope, 'editor'));
create policy "Recurring: editors update" on recurring_rules
  for update using (has_role(scope, 'editor'));
create policy "Recurring: owners delete" on recurring_rules
  for delete using (has_role(scope, 'owner'));
