-- Bảng danh mục chất dinh dưỡng + probiotic cho MagerLife.
--
-- Gộp DDL còn thiếu trong schema.sql với migrate-nutrients-v3.sql và v4.sql.
-- Chạy SAU schema.sql, TRƯỚC seed-nutrients.sql và seed-probiotics.sql.
-- Chạy lại nhiều lần an toàn: chỉ tạo bảng/cột còn thiếu, không xoá dữ liệu
-- người dùng (trừ chất 'probiotics' cũ, đã chuyển sang bảng riêng).

create extension if not exists pgcrypto;

-- ── 1. Danh mục chất dinh dưỡng ──────────────────────────────
create table if not exists nutrients (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  unit        text not null,
  category    text not null,
  group_name  text,
  subgroup    text,
  is_core     boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Database tạo từ trước có thể thiếu các cột mới
alter table nutrients add column if not exists group_name text;
alter table nutrients add column if not exists subgroup   text;
alter table nutrients add column if not exists is_core    boolean not null default false;
alter table nutrients add column if not exists sort_order integer not null default 0;

-- Ràng buộc category (thay bản cũ nếu có)
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'nutrients'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table nutrients drop constraint %I', constraint_name);
  end loop;
end $$;

alter table nutrients add constraint nutrients_category_check
  check (category in (
    'macro', 'mineral', 'vitamin', 'fatty_acid', 'amino_acid',
    'other_compound', 'supplement', 'bioactive'
  ));

-- ── 2. Lượng chất theo món và theo bữa ───────────────────────
create table if not exists food_item_nutrients (
  id            uuid primary key default gen_random_uuid(),
  food_item_id  uuid not null references food_library_items(id) on delete cascade,
  nutrient_id   uuid not null references nutrients(id) on delete cascade,
  amount        numeric(14, 4) not null default 0,
  unique (food_item_id, nutrient_id)
);

create index if not exists idx_food_item_nutrients_food
  on food_item_nutrients(food_item_id);

create table if not exists meal_log_nutrients (
  id           uuid primary key default gen_random_uuid(),
  meal_log_id  uuid not null references nutrition_meal_logs(id) on delete cascade,
  nutrient_id  uuid not null references nutrients(id) on delete cascade,
  amount       numeric(14, 4) not null default 0,
  unique (meal_log_id, nutrient_id)
);

create index if not exists idx_meal_log_nutrients_log
  on meal_log_nutrients(meal_log_id);

-- ── 3. Probiotic (đếm theo CFU, tách khỏi nutrients) ─────────
create table if not exists probiotic_strains (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  genus       text,
  species     text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists food_item_probiotics (
  id            uuid primary key default gen_random_uuid(),
  food_item_id  uuid not null references food_library_items(id) on delete cascade,
  strain_id     uuid not null references probiotic_strains(id) on delete cascade,
  cfu           numeric(20, 0) not null,
  unique (food_item_id, strain_id)
);

create index if not exists idx_food_item_probiotics_food
  on food_item_probiotics(food_item_id);

-- ── 4. Gộp khoá cũ sang khoá mới (từ v3), giữ lượng đã nhập ───
do $$
declare
  mapping record;
  old_id  uuid;
  new_id  uuid;
begin
  for mapping in
    select * from (values
      ('omega3',            'omega_3'),
      ('omega6',            'omega_6'),
      ('citrulline_malate', 'l_citrulline')
    ) as t(old_key, new_key)
  loop
    select id into old_id from nutrients where key = mapping.old_key;
    select id into new_id from nutrients where key = mapping.new_key;
    if old_id is null then
      continue;
    end if;
    if new_id is not null then
      update food_item_nutrients set nutrient_id = new_id
      where nutrient_id = old_id
        and not exists (select 1 from food_item_nutrients e
                        where e.food_item_id = food_item_nutrients.food_item_id and e.nutrient_id = new_id);
      update meal_log_nutrients set nutrient_id = new_id
      where nutrient_id = old_id
        and not exists (select 1 from meal_log_nutrients e
                        where e.meal_log_id = meal_log_nutrients.meal_log_id and e.nutrient_id = new_id);
    end if;
    delete from food_item_nutrients where nutrient_id = old_id;
    delete from meal_log_nutrients  where nutrient_id = old_id;
    delete from nutrients           where id = old_id;
    raise notice 'Đã gộp % -> %', mapping.old_key, mapping.new_key;
  end loop;
end $$;

-- ── 5. Gỡ chất 'probiotics' cũ khỏi nutrients (từ v4) ────────
delete from food_item_nutrients where nutrient_id in (select id from nutrients where key = 'probiotics');
delete from meal_log_nutrients  where nutrient_id in (select id from nutrients where key = 'probiotics');
delete from nutrients where key = 'probiotics';

-- ── 6. Kiểm tra ──────────────────────────────────────────────
-- Phải liệt kê đủ 5 bảng:
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('nutrients', 'food_item_nutrients', 'meal_log_nutrients',
                     'probiotic_strains', 'food_item_probiotics')
order by table_name;
-- Phải có cả subgroup và is_core:
select column_name from information_schema.columns
where table_name = 'nutrients' and column_name in ('subgroup', 'is_core');
