const baseUrl = (process.env.MAGERLIFE_SMOKE_API_BASE_URL || "https://mager-life-control-your-life.vercel.app/api").replace(/\/$/, "");
const password = process.env.MAGERLIFE_SMOKE_PASSWORD || "Asura19.03!";
const email = `smoke-${Date.now()}@example.com`;

async function request(label, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = body?.error?.message || response.statusText || "Request failed";
    throw new Error(`${label} failed (${response.status}): ${message}`);
  }
  return body;
}

function printPass(label) {
  console.log(`PASS ${label}`);
}

const health = await request("health", "/health");
if (!health.ok) throw new Error("health returned ok=false");
printPass("health");

const dbHealth = await request("db health", "/health/db");
if (!dbHealth.ok || dbHealth.driver !== "postgres" || !dbHealth.connection?.schemaReady) {
  throw new Error(`db health failed: ${JSON.stringify(dbHealth)}`);
}
printPass("db health");

const profile = {
  email,
  birthday: "2003-03-19",
  gender: "Nam",
  weight: "51.3",
  height: "163",
  currency: "VND",
  setupComplete: false,
};

const register = await request("register", "/auth/register", {
  method: "POST",
  body: JSON.stringify({ email, password, profile }),
});
if (!register.token || register.profile?.email !== email) throw new Error("register did not return a valid session");
printPass("register");

const authHeaders = { authorization: `Bearer ${register.token}` };

const login = await request("login", "/auth/login", {
  method: "POST",
  body: JSON.stringify({ identifier: email, password }),
});
if (!login.token || login.profile?.email !== email) throw new Error("login did not return a valid session");
printPass("login");

const profilePatch = await request("profile patch", "/profile", {
  method: "PATCH",
  headers: authHeaders,
  body: JSON.stringify({
    userId: email,
    patch: {
      ...profile,
      salary: 9_000_000,
      foodMonthlyBudget: 3_500_000,
      currentPriority: "Sức khỏe",
      setupComplete: true,
    },
  }),
});
if (!profilePatch.profile?.setupComplete) throw new Error("profile patch did not persist setupComplete");
printPass("profile patch");

const finance = await request("finance snapshot", "/finance/snapshot", {
  method: "PUT",
  headers: authHeaders,
  body: JSON.stringify({
    userId: email,
    financeSnapshot: {
      userId: email,
      currency: "VND",
      jars: [
        {
          id: "necessities",
          name: "Ăn uống",
          emoji: "🍜",
          percentage: 55,
          balance: 3_500_000,
          monthlyAllocation: 3_500_000,
          linkedGoals: [],
          isFixed: true,
        },
      ],
      transactions: [],
      updatedAt: new Date().toISOString(),
    },
  }),
});
if (!finance.financeSnapshot?.jars?.length) throw new Error("finance snapshot did not return jars");
printPass("finance snapshot");

const food = await request("food library", "/food-library", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    userId: email,
    items: [
      {
        id: `food-${Date.now()}`,
        name: "Ức gà smoke",
        kcalPer100g: 165,
        proteinPer100g: 31,
        carbPer100g: 0,
        fatPer100g: 4,
        fiberPer100g: 0,
        source: "user",
        aliases: ["ga"],
        tags: ["protein"],
      },
    ],
  }),
});
if (!food.accepted) throw new Error("food library did not accept item");
printPass("food library");

const nutrition = await request("nutrition log", "/nutrition/log", {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify({
    userId: email,
    mealLog: {
      id: `meal-${Date.now()}`,
      meal: "Trưa",
      name: "Cơm gà smoke",
      kcal: 650,
      carbs: 70,
      protein: 35,
      fat: 18,
      fiber: 4,
      createdAt: new Date().toISOString(),
    },
  }),
});
if (!nutrition.accepted) throw new Error("nutrition log was not accepted");
printPass("nutrition log");

console.log(`Smoke test completed for ${baseUrl}`);
