-- Probiotic strain seed for MagerLife — GENERATED FILE, DO NOT EDIT BY HAND.
-- Regenerate with: node scripts/generate-nutrient-artifacts.mjs
-- Source: PROBIOTIC_STRAINS in src/app/services/foodLibraryService.ts
--
-- Run migrate-nutrients-v4.sql first; it creates these tables.
-- Strains are counted in CFU and kept apart from nutrients on purpose: a live
-- culture count must never be summed into a nutrient intake total.

insert into probiotic_strains (key, name, genus, species, sort_order) values
  ('l_acidophilus', 'L. acidophilus', 'Lactobacillus', 'acidophilus', 1),
  ('l_rhamnosus', 'L. rhamnosus GG', 'Lactobacillus', 'rhamnosus', 2),
  ('l_plantarum', 'L. plantarum', 'Lactobacillus', 'plantarum', 3),
  ('l_casei', 'L. casei', 'Lactobacillus', 'casei', 4),
  ('l_reuteri', 'L. reuteri', 'Lactobacillus', 'reuteri', 5),
  ('b_bifidum', 'B. bifidum', 'Bifidobacterium', 'bifidum', 6),
  ('b_longum', 'B. longum', 'Bifidobacterium', 'longum', 7),
  ('b_breve', 'B. breve', 'Bifidobacterium', 'breve', 8),
  ('b_lactis', 'B. lactis', 'Bifidobacterium', 'lactis', 9),
  ('s_boulardii', 'S. boulardii', 'Saccharomyces', 'boulardii', 10),
  ('bacillus_coagulans', 'Bacillus coagulans', 'Bacillus', 'coagulans', 11),
  ('bacillus_subtilis', 'Bacillus subtilis', 'Bacillus', 'subtilis', 12)
on conflict (key) do update set
  name = excluded.name,
  genus = excluded.genus,
  species = excluded.species,
  sort_order = excluded.sort_order;

-- Dọn các chủng không còn trong danh sách.
delete from food_item_probiotics where strain_id in (select id from probiotic_strains where key <> all(array['l_acidophilus', 'l_rhamnosus', 'l_plantarum', 'l_casei', 'l_reuteri', 'b_bifidum', 'b_longum', 'b_breve', 'b_lactis', 's_boulardii', 'bacillus_coagulans', 'bacillus_subtilis']));
delete from probiotic_strains where key <> all(array['l_acidophilus', 'l_rhamnosus', 'l_plantarum', 'l_casei', 'l_reuteri', 'b_bifidum', 'b_longum', 'b_breve', 'b_lactis', 's_boulardii', 'bacillus_coagulans', 'bacillus_subtilis']);

-- Verify:
select genus, count(*) from probiotic_strains group by genus order by min(sort_order);
