-- Development reset only.
-- Use this only when the Supabase project has no production/user data yet.

drop table if exists agent_training_records cascade;
drop table if exists agent_decision_logs cascade;
drop table if exists agent_events cascade;
drop table if exists pending_nutrition_api_requests cascade;
drop table if exists nutrition_meal_logs cascade;
drop table if exists food_library_items cascade;
drop table if exists transactions cascade;
drop table if exists user_jars cascade;
drop table if exists user_profiles cascade;
drop table if exists app_users cascade;
