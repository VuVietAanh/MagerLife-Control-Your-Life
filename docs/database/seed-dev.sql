-- Development seed for MagerLife.
-- Run after schema.sql in a local Postgres/Supabase database.

insert into app_users (email, display_name, role, subscription_plan, last_active_at)
values
  ('admin@magerlife.local', 'MagerLife Admin', 'admin', 'pro', now()),
  ('demo@magerlife.local', 'Demo User', 'user', 'free', now())
on conflict (email) do update set
  display_name = excluded.display_name,
  role = excluded.role,
  subscription_plan = excluded.subscription_plan,
  updated_at = now();

insert into user_profiles (
  user_id,
  birthday,
  gender,
  weight_kg,
  height_cm,
  salary,
  currency,
  food_monthly_budget,
  current_priority,
  goal_summary,
  diet_preference,
  budget_style,
  setup_complete,
  profile_payload
)
select
  id,
  date '2003-01-01',
  'Nam',
  51,
  163,
  9000000,
  'VND',
  4000000,
  'Giảm mỡ',
  'Giảm mỡ, tăng cơ, ăn lành mạnh hơn',
  'High Protein',
  'Chi tiêu cân bằng',
  true,
  '{"source":"seed-dev"}'::jsonb
from app_users
where email = 'demo@magerlife.local'
on conflict (user_id) do update set
  salary = excluded.salary,
  food_monthly_budget = excluded.food_monthly_budget,
  current_priority = excluded.current_priority,
  goal_summary = excluded.goal_summary,
  diet_preference = excluded.diet_preference,
  updated_at = now();

insert into food_library_items (
  source,
  name,
  aliases,
  serving_amount,
  serving_unit,
  kcal_per_100,
  carbs_per_100,
  protein_per_100,
  fat_per_100,
  fiber_per_100,
  tags,
  verified
)
values
  ('admin', 'Trứng gà', '["trứng", "trung", "egg"]'::jsonb, 100, 'g', 155, 1.1, 13, 11, 0, '["protein", "tiết kiệm"]'::jsonb, true),
  ('admin', 'Ức gà', '["ức gà", "uc ga", "chicken breast"]'::jsonb, 100, 'g', 165, 0, 31, 3.6, 0, '["protein", "meal prep"]'::jsonb, true),
  ('admin', 'Cơm trắng', '["cơm", "com", "rice"]'::jsonb, 100, 'g', 130, 28, 2.7, 0.3, 0.4, '["carb", "việt nam"]'::jsonb, true),
  ('admin', 'Đậu phụ', '["đậu phụ", "dau phu", "tofu"]'::jsonb, 100, 'g', 76, 1.9, 8, 4.8, 0.3, '["protein", "chay"]'::jsonb, true)
on conflict do nothing;
