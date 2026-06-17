-- MagerLife database schema draft
-- Target: PostgreSQL 15+ / Supabase-compatible SQL.
-- JSONB fields keep Agent context flexible while indexed columns keep admin analytics fast.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  password_hash text,
  password_salt text,
  role text not null default 'user' check (role in ('user', 'admin')),
  subscription_plan text not null default 'free' check (subscription_plan in ('free', 'pro')),
  status text not null default 'active' check (status in ('active', 'paused', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_active_at timestamptz
);

create table if not exists user_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  birthday date,
  gender text,
  weight_kg numeric(6,2),
  height_cm numeric(6,2),
  salary numeric(14,2),
  currency text not null default 'VND' check (currency in ('VND', 'USD')),
  food_monthly_budget numeric(14,2),
  health_goal text check (health_goal in ('gain', 'maintain', 'lose')),
  current_priority text,
  goal_summary text,
  diet_preference text,
  budget_style text,
  support_style text,
  calorie_note text,
  preference_weights jsonb not null default '{}'::jsonb,
  extracted_signals jsonb not null default '{}'::jsonb,
  custom_choice_inputs jsonb not null default '{}'::jsonb,
  profile_payload jsonb not null default '{}'::jsonb,
  setup_complete boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists user_jars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  jar_key text not null,
  name text not null,
  emoji text,
  percentage numeric(6,2) not null default 0,
  balance numeric(14,2) not null default 0,
  monthly_allocation numeric(14,2) not null default 0,
  purpose_note text,
  linked_goals jsonb not null default '[]'::jsonb,
  is_fixed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, jar_key)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid not null references app_users(id) on delete cascade,
  jar_id uuid references user_jars(id) on delete set null,
  type text not null check (type in ('expense', 'income')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'VND' check (currency in ('VND', 'USD')),
  item_name text not null,
  spent_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists food_library_items (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  owner_user_id uuid references app_users(id) on delete cascade,
  source text not null check (source in ('admin', 'user', 'external_api', 'llm_estimate')),
  name text not null,
  aliases jsonb not null default '[]'::jsonb,
  serving_amount numeric(10,2) not null default 100,
  serving_unit text not null default 'g' check (serving_unit in ('g', 'kg', 'ml', 'l')),
  kcal_per_100 numeric(10,2) not null check (kcal_per_100 >= 0),
  carbs_per_100 numeric(10,2) not null default 0,
  protein_per_100 numeric(10,2) not null default 0,
  fat_per_100 numeric(10,2) not null default 0,
  fiber_per_100 numeric(10,2) not null default 0,
  tags jsonb not null default '[]'::jsonb,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nutrition_meal_logs (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid not null references app_users(id) on delete cascade,
  meal text not null check (meal in ('Sáng', 'Trưa', 'Tối', 'Phụ')),
  name text not null,
  kcal numeric(10,2) not null check (kcal >= 0),
  carbs numeric(10,2),
  protein numeric(10,2),
  fat numeric(10,2),
  fiber numeric(10,2),
  price numeric(14,2),
  currency text not null default 'VND' check (currency in ('VND', 'USD')),
  source text not null default 'chat' check (source in ('chat', 'manual', 'admin_library', 'user_library', 'llm_estimate', 'external_api')),
  raw_text text,
  confidence numeric(4,3),
  created_at timestamptz not null default now()
);

create table if not exists pending_nutrition_api_requests (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid not null references app_users(id) on delete cascade,
  text text not null,
  meal text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  candidates jsonb not null default '[]'::jsonb,
  selected_candidate jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid references app_users(id) on delete set null,
  event_type text not null,
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_decision_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_users(id) on delete set null,
  agent_name text not null,
  input jsonb not null default '{}'::jsonb,
  rules_fired jsonb not null default '[]'::jsonb,
  api_called boolean not null default false,
  output jsonb not null default '{}'::jsonb,
  confidence numeric(5,2),
  accepted boolean,
  created_at timestamptz not null default now()
);

create table if not exists agent_training_records (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid references app_users(id) on delete set null,
  event_id uuid references agent_events(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  label text,
  accepted boolean,
  train_split text not null default 'candidate' check (train_split in ('candidate', 'train', 'validation', 'holdout')),
  created_at timestamptz not null default now()
);

-- Migration-safe patches for databases that already had older draft tables.
alter table if exists app_users add column if not exists password_hash text;
alter table if exists app_users add column if not exists password_salt text;
alter table if exists app_users add column if not exists status text not null default 'active';
alter table if exists app_users add column if not exists last_active_at timestamptz;
alter table if exists app_users add column if not exists created_at timestamptz not null default now();
alter table if exists app_users add column if not exists updated_at timestamptz not null default now();

alter table if exists user_profiles add column if not exists profile_payload jsonb not null default '{}'::jsonb;
alter table if exists user_profiles add column if not exists setup_complete boolean not null default false;
alter table if exists user_profiles add column if not exists updated_at timestamptz not null default now();

alter table if exists user_jars add column if not exists jar_key text;
alter table if exists user_jars add column if not exists monthly_allocation numeric(14,2) not null default 0;
alter table if exists user_jars add column if not exists purpose_note text;
alter table if exists user_jars add column if not exists linked_goals jsonb not null default '[]'::jsonb;
alter table if exists user_jars add column if not exists is_fixed boolean not null default false;
alter table if exists user_jars add column if not exists created_at timestamptz not null default now();
alter table if exists user_jars add column if not exists updated_at timestamptz not null default now();

alter table if exists transactions add column if not exists external_id text;
alter table if exists transactions add column if not exists user_id uuid references app_users(id) on delete cascade;
alter table if exists transactions add column if not exists jar_id uuid references user_jars(id) on delete set null;
alter table if exists transactions add column if not exists type text not null default 'expense';
alter table if exists transactions add column if not exists amount numeric(14,2) not null default 0;
alter table if exists transactions add column if not exists currency text not null default 'VND';
alter table if exists transactions add column if not exists item_name text not null default 'Giao dịch';
alter table if exists transactions add column if not exists spent_at timestamptz not null default now();
alter table if exists transactions add column if not exists note text;
alter table if exists transactions add column if not exists created_at timestamptz not null default now();

create unique index if not exists idx_transactions_external_id_unique on transactions(external_id) where external_id is not null;
create index if not exists idx_app_users_plan on app_users(subscription_plan);
create index if not exists idx_app_users_role on app_users(role);
create index if not exists idx_transactions_user_spent_at on transactions(user_id, spent_at desc);
create index if not exists idx_food_library_source on food_library_items(source);
create index if not exists idx_food_library_owner on food_library_items(owner_user_id);
create index if not exists idx_nutrition_logs_user_created on nutrition_meal_logs(user_id, created_at desc);
create index if not exists idx_agent_events_user_created on agent_events(user_id, created_at desc);
create index if not exists idx_agent_training_split on agent_training_records(train_split);
