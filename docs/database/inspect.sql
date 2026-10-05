-- Các câu lệnh kiểm tra dữ liệu MagerLife trên Neon.
-- Chạy từng khối một trong Neon SQL Editor (bấm Run, không bấm Explain).

-- ============================================================
-- 1. TỔNG QUAN: mỗi bảng có bao nhiêu dòng, nặng bao nhiêu
-- ============================================================
select
  c.relname                                        as "bảng",
  c.reltuples::bigint                              as "số dòng (ước tính)",
  pg_size_pretty(pg_total_relation_size(c.oid))    as "dung lượng"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;


-- ============================================================
-- 2. SƠ ĐỒ QUAN HỆ: bảng nào trỏ tới bảng nào (khóa ngoại)
--    Đây là phần "các kết nối" giữa các bảng.
-- ============================================================
select
  tc.table_name     as "bảng con",
  kcu.column_name   as "cột",
  '->'              as " ",
  ccu.table_name    as "bảng cha",
  ccu.column_name   as "cột cha",
  rc.delete_rule    as "khi xóa cha"
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
 and kcu.table_schema    = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema    = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name  = tc.constraint_name
 and rc.constraint_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema    = 'public'
order by tc.table_name, kcu.column_name;


-- ============================================================
-- 3. CẤU TRÚC CHI TIẾT: mọi cột của mọi bảng
-- ============================================================
select
  table_name    as "bảng",
  ordinal_position as "#",
  column_name   as "cột",
  data_type     as "kiểu",
  is_nullable   as "cho phép null",
  column_default as "mặc định"
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;


-- ============================================================
-- 4. DANH MỤC CHẤT DINH DƯỠNG: kiểm tra sau khi chạy seed
--    Phải ra 64 chất trong 9 nhóm.
-- ============================================================
select group_name as "nhóm", count(*) as "số chất"
from nutrients
group by group_name
order by min(sort_order);

select key, name, unit, category, group_name, sort_order
from nutrients
order by sort_order;


-- ============================================================
-- 5. MÓN ĂN KÈM ĐẦY ĐỦ CHẤT: nối 3 bảng dinh dưỡng lại
--    Đây là câu kiểm tra dữ liệu thật sự có được lưu đúng không.
-- ============================================================
select
  f.name        as "món",
  f.kcal        as "kcal",
  f.protein     as "đạm",
  n.group_name  as "nhóm chất",
  n.name        as "chất",
  fin.amount    as "lượng",
  n.unit        as "đơn vị"
from food_library_items f
left join food_item_nutrients fin on fin.food_item_id = f.id
left join nutrients n             on n.id = fin.nutrient_id
order by f.name, n.sort_order;


-- ============================================================
-- 6. NGƯỜI DÙNG VÀ DỮ LIỆU TÀI CHÍNH CỦA HỌ
-- ============================================================
select
  u.email,
  u.role,
  u.subscription_plan             as "gói",
  count(distinct j.id)            as "số hũ",
  count(distinct t.id)            as "số giao dịch",
  u.last_active_at                as "hoạt động lần cuối"
from app_users u
left join user_jars j    on j.user_id = u.id
left join transactions t on t.user_id = u.id
group by u.id, u.email, u.role, u.subscription_plan, u.last_active_at
order by u.last_active_at desc nulls last;


-- ============================================================
-- 7. BẢNG RỖNG: biết ngay bảng nào chưa có dữ liệu
-- ============================================================
select c.relname as "bảng chưa có dữ liệu"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.reltuples = 0
order by c.relname;
