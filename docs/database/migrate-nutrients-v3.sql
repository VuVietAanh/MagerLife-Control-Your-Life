-- Nutrient catalog v3 — chạy MỘT LẦN trước seed-nutrients.sql.
--
-- Làm 2 việc:
--   1. Thêm cột subgroup + is_core (phân nhóm con, và đánh dấu macro cơ bản)
--   2. Dọn các dòng seed cũ đã bị thay thế, để không còn trùng lặp
--
-- An toàn: chỉ đụng tới các khóa cũ liệt kê tường minh bên dưới.

-- ── 1. Cột mới ───────────────────────────────────────────────
alter table nutrients add column if not exists subgroup text;
alter table nutrients add column if not exists is_core boolean not null default false;


-- ── 2. Chuyển dữ liệu từ khóa cũ sang khóa mới ───────────────
-- Nếu một món đã ghi lượng theo khóa cũ, chuyển sang khóa mới rồi mới xóa,
-- để không mất dữ liệu người dùng đã nhập.
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
      -- Giữ lượng đã nhập: chuyển sang chất mới, bỏ qua nếu đã có sẵn.
      update food_item_nutrients set nutrient_id = new_id
      where nutrient_id = old_id
        and not exists (
          select 1 from food_item_nutrients existing
          where existing.food_item_id = food_item_nutrients.food_item_id
            and existing.nutrient_id = new_id
        );
      update meal_log_nutrients set nutrient_id = new_id
      where nutrient_id = old_id
        and not exists (
          select 1 from meal_log_nutrients existing
          where existing.meal_log_id = meal_log_nutrients.meal_log_id
            and existing.nutrient_id = new_id
        );
    end if;

    delete from food_item_nutrients where nutrient_id = old_id;
    delete from meal_log_nutrients  where nutrient_id = old_id;
    delete from nutrients           where id = old_id;
    raise notice 'Đã gộp % -> %', mapping.old_key, mapping.new_key;
  end loop;
end $$;


-- ── 3. Kiểm tra ──────────────────────────────────────────────
-- Phải trả về 0 dòng:
select key from nutrients where key in ('omega3', 'omega6', 'citrulline_malate');
