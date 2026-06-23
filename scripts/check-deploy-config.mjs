import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (error) {
    failures.push(`${relativePath}: ${error instanceof Error ? error.message : "cannot read JSON"}`);
    return null;
  }
}

function readText(relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
  } catch (error) {
    failures.push(`${relativePath}: ${error instanceof Error ? error.message : "cannot read file"}`);
    return "";
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const packageJson = readJson("package.json");
assert(packageJson?.scripts?.build === "vite build", "package.json must keep build script as `vite build`.");
assert(packageJson?.scripts?.["smoke:production"], "package.json must expose smoke:production.");

const vercelJson = readJson("vercel.json");
assert(vercelJson?.framework === "vite", "vercel.json framework must be vite.");
assert(vercelJson?.outputDirectory === "dist", "vercel.json outputDirectory must be dist.");
const routes = Array.isArray(vercelJson?.routes) ? vercelJson.routes : [];
assert(routes.some((route) => route.src === "/api/(.*)" && route.dest === "/api/[...path].js"), "vercel.json must route /api/* to api/[...path].js.");
assert(routes.some((route) => route.handle === "filesystem"), "vercel.json must include filesystem handler before SPA fallback.");
assert(routes.some((route) => route.src === "/(.*)" && route.dest === "/index.html"), "vercel.json must include SPA fallback to /index.html.");

const apiEntrypoint = readText("api/[...path].js");
assert(apiEntrypoint.includes("handleMagerLifeApiRequest"), "api/[...path].js must call handleMagerLifeApiRequest.");
assert(apiEntrypoint.includes("replace(/^\\/api"), "api/[...path].js must strip /api prefix before routing.");

const server = readText("src/server/mockApiServer.mjs");
assert(server.includes('url.pathname === "/health/db"'), "API server must expose /health/db.");
assert(server.includes("process.env.PORT"), "API server must honor process.env.PORT for cloud runtimes.");
assert(server.includes("normalizeMealName"), "API server must normalize nutrition meal names.");

const schema = readText("docs/database/schema.sql");
for (const table of ["app_users", "user_profiles", "user_jars", "transactions", "nutrition_meal_logs", "food_library_items"]) {
  assert(schema.includes(`create table if not exists ${table}`), `schema.sql must create ${table}.`);
}
for (const column of ["password_hash", "password_salt", "spent_at", "profile_payload"]) {
  assert(schema.includes(column), `schema.sql must include ${column}.`);
}

const envExample = readText(".env.example");
for (const key of ["MAGERLIFE_DB_DRIVER", "DATABASE_URL", "DATABASE_SSL", "MAGERLIFE_SESSION_SECRET", "MAGERLIFE_ADMIN_EMAILS"]) {
  assert(envExample.includes(`${key}=`), `.env.example must document ${key}.`);
}

const deployDoc = readText("docs/deploy-free-vercel-supabase.md");
assert(deployDoc.includes("VITE_MAGERLIFE_API_BASE_URL=/api"), "deploy doc must instruct Vercel API base as /api.");
assert(deployDoc.includes("npm run smoke:production"), "deploy doc must mention production smoke test.");
assert(deployDoc.includes("/api/health/db"), "deploy doc must mention /api/health/db.");

if (failures.length) {
  console.error("Deploy config check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Deploy config check passed.");
