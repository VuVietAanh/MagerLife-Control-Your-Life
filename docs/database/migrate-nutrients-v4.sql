-- Nutrient catalog v4 — chạy SAU migrate-nutrients-v3.sql, TRƯỚC seed-nutrients.sql.
--
-- Hai việc:
--   1. Cho phép category 'bioactive' (polyphenol, carotenoid, chiết xuất thảo dược)
--   2. Tách probiotic ra bảng riêng — CFU là số lượng vi sinh vật sống, không phải
--      lượng chất dinh dưỡng, nên để chung bảng nutrients sẽ làm hỏng mọi phép
--      cộng dồn kiểu "tổng lượng đã nạp" hay "% nhu cầu hằng ngày".

-- ── 1. Nới ràng buộc category ─────────────────────────────────
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'nutrients'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%category%';

  if constraint_name is not null then
    execute format('alter table nutrients drop constraint %I', constraint_name);
  end if;
end $$;

alter table nutrients add constraint nutrients_category_check
  check (category in (
    'macro', 'mineral', 'vitamin', 'fatty_acid', 'amino_acid',
    'other_compound', 'supplement', 'bioactive'
  ));


-- ── 2. Bảng probiotic ─────────────────────────────────────────
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


-- ── 3. Gỡ probiotic khỏi bảng nutrients ───────────────────────
-- Chất 'probiotics' cũ không còn thuộc danh mục dinh dưỡng nữa.
delete from food_item_nutrients
  where nutrient_id in (select id from nutrients where key = 'probiotics');
delete from meal_log_nutrients
  where nutrient_id in (select id from nutrients where key = 'probiotics');
delete from nutrients where key = 'probiotics';


-- ── 4. Kiểm tra ───────────────────────────────────────────────
-- Phải ra 0 dòng:
select key from nutrients where key = 'probiotics';
-- Phải chạy được, không lỗi constraint:
select 'bioactive'::text as category_hop_le;
