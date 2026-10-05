/**
 * Keeps every copy of the nutrient catalog derived from one source.
 *
 * NUTRIENT_CATALOG in src/app/services/foodLibraryService.ts is that source. From it
 * this script regenerates:
 *   - docs/database/seed-nutrients.sql   (what gets applied to the database)
 *   - FALLBACK_NUTRIENT_CATALOG in src/server/dbRepository.mjs (memory-driver fallback)
 *
 * At runtime the database is authoritative: the admin form reads the catalog back
 * through GET /nutrients. These generated copies exist only to seed it and to keep
 * the memory driver usable offline — hand-editing either one is what lets them drift.
 *
 * Run: node scripts/generate-nutrient-artifacts.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const SERVICE_PATH = "src/app/services/foodLibraryService.ts";
const SQL_PATH = "docs/database/seed-nutrients.sql";
const REPOSITORY_PATH = "src/server/dbRepository.mjs";

function parseCatalog() {
  const source = readFileSync(SERVICE_PATH, "utf8");
  const start = source.indexOf("export const NUTRIENT_CATALOG");
  const end = source.indexOf("export const FOOD_LIBRARY_STORAGE_KEY");
  if (start === -1 || end === -1) throw new Error(`Could not locate NUTRIENT_CATALOG in ${SERVICE_PATH}`);

  const pattern = /\{ key: "([^"]+)", name: "([^"]+)", unit: "([^"]+)", category: "([^"]+)", groupName: "([^"]+)", subgroup: "([^"]*)", isCore: (true|false), sortOrder: (\d+) \}/g;
  const rows = [...source.slice(start, end).matchAll(pattern)].map(([, key, name, unit, category, groupName, subgroup, isCore, sortOrder]) => ({
    key,
    name,
    unit,
    category,
    groupName,
    subgroup,
    isCore: isCore === "true",
    sortOrder: Number(sortOrder),
  }));

  if (!rows.length) throw new Error("Parsed zero nutrients — has the catalog's formatting changed?");
  const duplicates = rows.map((row) => row.key).filter((key, index, all) => all.indexOf(key) !== index);
  if (duplicates.length) throw new Error(`Duplicate nutrient keys: ${duplicates.join(", ")}`);
  return rows;
}

function writeSeedSql(rows) {
  const sqlString = (value) => `'${value.replace(/'/g, "''")}'`;
  const keyArray = `array[${rows.map((row) => sqlString(row.key)).join(", ")}]`;
  const values = rows
    .map((row) => `  (${sqlString(row.key)}, ${sqlString(row.name)}, ${sqlString(row.unit)}, ${sqlString(row.category)}, ${sqlString(row.groupName)}, ${row.subgroup ? sqlString(row.subgroup) : "null"}, ${row.isCore}, ${row.sortOrder})`)
    .join(",\n");

  writeFileSync(
    SQL_PATH,
    `-- Nutrient catalog seed for MagerLife — GENERATED FILE, DO NOT EDIT BY HAND.
-- Regenerate with: node scripts/generate-nutrient-artifacts.mjs
-- Source: NUTRIENT_CATALOG in ${SERVICE_PATH}
--
-- Safe to re-run: existing keys are updated in place, nothing is deleted.
-- The nutrients table is the source of truth at runtime; the admin form reads it
-- back through GET /nutrients, so whatever lands here is what an admin can record.

insert into nutrients (key, name, unit, category, group_name, subgroup, is_core, sort_order) values
${values}
on conflict (key) do update set
  name = excluded.name,
  unit = excluded.unit,
  category = excluded.category,
  group_name = excluded.group_name,
  subgroup = excluded.subgroup,
  is_core = excluded.is_core,
  sort_order = excluded.sort_order;

-- Dọn các chất không còn trong danh mục, kèm mọi lượng đã gắn với chúng.
-- Chạy migrate-nutrients-v3.sql TRƯỚC để các khóa cũ được gộp chứ không bị mất.
delete from food_item_nutrients where nutrient_id in (select id from nutrients where key <> all(${keyArray}));
delete from meal_log_nutrients  where nutrient_id in (select id from nutrients where key <> all(${keyArray}));
delete from nutrients where key <> all(${keyArray});

-- Verify:
select group_name, count(*) from nutrients group by group_name order by min(sort_order);
`,
    "utf8"
  );
}

function writeRepositoryFallback(rows) {
  const source = readFileSync(REPOSITORY_PATH, "utf8");
  const startMarker = "const FALLBACK_NUTRIENT_CATALOG = [";
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`Could not locate FALLBACK_NUTRIENT_CATALOG in ${REPOSITORY_PATH}`);
  const end = source.indexOf("];", start) + 2;

  const entries = rows
    .map((row) => `  { key: "${row.key}", name: "${row.name}", unit: "${row.unit}", category: "${row.category}", groupName: "${row.groupName}", subgroup: "${row.subgroup}", isCore: ${row.isCore}, sortOrder: ${row.sortOrder} },`)
    .join("\n");

  writeFileSync(REPOSITORY_PATH, `${source.slice(0, start)}${startMarker}\n${entries}\n];${source.slice(end)}`, "utf8");
}

const rows = parseCatalog();
writeSeedSql(rows);
writeRepositoryFallback(rows);

const byGroup = rows.reduce((acc, row) => ({ ...acc, [row.groupName]: (acc[row.groupName] || 0) + 1 }), {});
console.log(`Generated ${rows.length} nutrients from ${SERVICE_PATH}`);
Object.entries(byGroup).forEach(([group, count]) => console.log(`  ${group}: ${count}`));
console.log(`\nWrote ${SQL_PATH}\nWrote FALLBACK_NUTRIENT_CATALOG in ${REPOSITORY_PATH}`);
