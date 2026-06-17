import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

function numberOrNull(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function sanitizeProfile(profile = {}) {
  const safeRole = profile.role === "admin" ? "admin" : "user";
  const safePlan = profile.subscriptionPlan === "pro" ? "pro" : "free";
  return {
    ...profile,
    email: normalizeEmail(profile.email),
    role: safeRole,
    subscriptionPlan: safePlan,
  };
}

function bootstrapAdminEmails() {
  return new Set(
    String(process.env.MAGERLIFE_ADMIN_EMAILS || "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
}

function isBootstrapAdminEmail(email = "") {
  return bootstrapAdminEmails().has(normalizeEmail(email));
}

function serverRoleForEmail(email = "", fallbackRole = "user") {
  return isBootstrapAdminEmail(email) ? "admin" : fallbackRole === "admin" ? "admin" : "user";
}

function serverPlanForRole(role = "user", fallbackPlan = "free") {
  if (role === "admin") return "pro";
  return fallbackPlan === "pro" ? "pro" : "free";
}

function planFromBillingStatus(status = "", plan = "") {
  if (plan === "pro") return "pro";
  if (["active", "paid", "trialing"].includes(String(status).toLowerCase())) return "pro";
  return "free";
}

function applyClientProfilePatch(current = {}, patch = {}) {
  const { role, subscriptionPlan, ...clientPatch } = patch;
  return {
    ...current,
    ...clientPatch,
    role: current.role || "user",
    subscriptionPlan: current.subscriptionPlan || "free",
  };
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const { hash } = hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sessionSecret() {
  return process.env.MAGERLIFE_SESSION_SECRET || "magerlife-dev-session-secret-change-before-production";
}

function signSessionPayload(payload) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function createSessionToken(email, role = "user") {
  const payload = Buffer.from(JSON.stringify({
    sub: normalizeEmail(email),
    role: role === "admin" ? "admin" : "user",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  })).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

export function verifySessionToken(token = "") {
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return null;
  const expectedSignature = signSessionPayload(payload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.sub || Number(session.exp || 0) < Math.floor(Date.now() / 1000)) return null;
    return {
      sub: normalizeEmail(session.sub),
      role: session.role === "admin" ? "admin" : "user",
    };
  } catch {
    return null;
  }
}

function normalizeFoodItems(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.id && item?.name).map((item) => ({
    ...item,
    source: item.source === "user" ? "user" : "admin",
    updatedAt: item.updatedAt || new Date().toISOString(),
  }));
}

function normalizeFinanceSnapshot({ userId, financeSnapshot } = {}) {
  const normalizedEmail = normalizeEmail(userId || financeSnapshot?.userId);
  const snapshot = financeSnapshot || {};
  return {
    userId: normalizedEmail,
    currency: snapshot.currency || "VND",
    jars: Array.isArray(snapshot.jars) ? snapshot.jars.filter((jar) => jar?.id && jar?.name) : [],
    transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions.filter((tx) => tx?.id && tx?.jarId && tx?.type) : [],
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
  };
}

function buildTrainingRecordFromAgentEvent(event = {}) {
  return {
    id: `${event.id || Date.now()}-training`,
    event,
    output: {
      type: event.type,
      source: event.source,
      payload: event.payload || {},
    },
    label: event.type || "agent_event",
    accepted: event.type !== "nutrition_api_pending",
    trainSplit: "candidate",
    createdAt: event.createdAt || new Date().toISOString(),
  };
}

function buildMemoryAnalytics(store) {
  const users = [...store.profiles.entries()].map(([id, profile]) => ({
    id,
    email: profile.email || id,
    profile,
    role: profile.role || "user",
    subscriptionPlan: profile.subscriptionPlan || "free",
    createdAt: profile.createdAt || new Date().toISOString(),
    updatedAt: profile.updatedAt || new Date().toISOString(),
    lastActiveAt: profile.lastActiveAt || new Date().toISOString(),
  }));
  const planCounts = users.reduce(
    (acc, user) => {
      acc[user.subscriptionPlan || "free"] += 1;
      return acc;
    },
    { free: 0, pro: 0 }
  );
  return {
    analytics: {
      totalUsers: users.length,
      paidUsers: planCounts.pro,
      activeUsers: Math.max(0, Math.round(users.length * 0.82)),
      revenue: planCounts.pro * 149000,
      planCounts,
      foodLibraryCount: store.foodLibrary.length,
      pendingFoodRequests: users.reduce(
        (sum, user) => sum + ((user.profile?.pendingNutritionApiRequests || []).filter((request) => request.status === "pending").length),
        store.agentEvents.filter((event) => event.type === "nutrition_api_pending").length
      ),
      agentEventCount: store.agentEvents.length,
    },
    users,
    recentEvents: store.agentEvents.slice(-20).reverse(),
    trainingRecords: store.trainingRecords.slice(-200),
  };
}

function createMemoryRepository() {
  const store = {
    profiles: new Map(),
    financeSnapshots: new Map(),
    nutritionLogs: [],
    agentEvents: [],
    trainingRecords: [],
    foodLibrary: [],
    authAccounts: new Map(),
  };

  return {
    driver: "memory",
    async registerAccount({ email, password, profile = {} } = {}) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !password) return { error: { code: "VALIDATION_ERROR", message: "Email and password are required" } };
      if (store.authAccounts.has(normalizedEmail)) return { error: { code: "ACCOUNT_EXISTS", message: "Account already exists" } };
      const { hash, salt } = hashPassword(password);
      const nextProfile = sanitizeProfile({
        ...profile,
        email: normalizedEmail,
        role: serverRoleForEmail(normalizedEmail),
        subscriptionPlan: serverPlanForRole(serverRoleForEmail(normalizedEmail)),
        setupComplete: Boolean(profile.setupComplete),
      });
      store.authAccounts.set(normalizedEmail, { passwordHash: hash, passwordSalt: salt });
      store.profiles.set(normalizedEmail, { ...nextProfile, updatedAt: new Date().toISOString() });
      return { userId: normalizedEmail, profile: nextProfile, token: createSessionToken(normalizedEmail, nextProfile.role) };
    },
    async loginAccount({ identifier, password } = {}) {
      const normalizedEmail = normalizeEmail(identifier);
      const account = store.authAccounts.get(normalizedEmail);
      if (!account || !verifyPassword(password, account.passwordSalt, account.passwordHash)) {
        return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };
      }
      const profile = sanitizeProfile(store.profiles.get(normalizedEmail) || { email: normalizedEmail, birthday: "", gender: "", setupComplete: false });
      if (isBootstrapAdminEmail(normalizedEmail) && profile.role !== "admin") {
        profile.role = "admin";
        profile.subscriptionPlan = "pro";
        store.profiles.set(normalizedEmail, { ...profile, updatedAt: new Date().toISOString() });
      }
      store.profiles.set(normalizedEmail, { ...profile, lastActiveAt: new Date().toISOString() });
      return { userId: normalizedEmail, profile, token: createSessionToken(normalizedEmail, profile.role) };
    },
    async getProfile(userId) {
      const normalizedEmail = normalizeEmail(userId);
      const profile = store.profiles.get(normalizedEmail);
      return { profile: profile ? sanitizeProfile(profile) : null };
    },
    async patchProfile({ userId, patch = {} } = {}) {
      const normalizedEmail = normalizeEmail(userId || patch.email);
      const current = store.profiles.get(normalizedEmail) || { email: normalizedEmail, birthday: "", gender: "", setupComplete: false };
      const nextProfile = sanitizeProfile({
        ...applyClientProfilePatch(current, patch),
        email: normalizedEmail || patch.email || current.email,
        updatedAt: new Date().toISOString(),
      });
      store.profiles.set(nextProfile.email, nextProfile);
      return { profile: nextProfile, changedFields: Object.keys(patch) };
    },
    async logNutritionMeal({ userId, mealLog } = {}) {
      const normalizedEmail = normalizeEmail(userId);
      if (!mealLog?.id) return { error: { code: "VALIDATION_ERROR", message: "mealLog is required" } };
      const current = store.profiles.get(normalizedEmail) || { email: normalizedEmail, birthday: "", gender: "", setupComplete: false };
      const meals = current.nutritionMeals || [];
      const nextMeals = [...meals.filter((meal) => meal.id !== mealLog.id), mealLog];
      store.profiles.set(normalizedEmail, { ...current, nutritionMeals: nextMeals, updatedAt: new Date().toISOString() });
      store.nutritionLogs.push({ ...mealLog, userId: normalizedEmail });
      store.nutritionLogs = store.nutritionLogs.slice(-2000);
      return { mealLog, accepted: true };
    },
    async getFoodLibrary({ scope = "admin", userId } = {}) {
      const normalizedEmail = normalizeEmail(userId);
      const items = store.foodLibrary.filter((item) => {
        if (scope === "all") return item.source === "admin" || item.ownerEmail === normalizedEmail;
        if (scope === "user") return item.source === "user" && (!normalizedEmail || item.ownerEmail === normalizedEmail);
        return item.source === "admin";
      });
      return { items, serverTime: new Date().toISOString() };
    },
    async upsertFoodLibrary({ items = [], userId } = {}) {
      const normalizedEmail = normalizeEmail(userId);
      const incoming = normalizeFoodItems(items).map((item) => item.source === "user" ? { ...item, ownerEmail: item.ownerEmail || normalizedEmail } : item);
      const byId = new Map(store.foodLibrary.map((item) => [item.id, item]));
      incoming.forEach((item) => byId.set(item.id, item));
      store.foodLibrary = [...byId.values()];
      return { accepted: incoming.length, items: incoming, serverTime: new Date().toISOString() };
    },
    async getFinanceSnapshot(userId) {
      const normalizedEmail = normalizeEmail(userId);
      return { financeSnapshot: store.financeSnapshots.get(normalizedEmail) || null };
    },
    async upsertFinanceSnapshot(payload = {}) {
      const snapshot = normalizeFinanceSnapshot(payload);
      store.financeSnapshots.set(snapshot.userId, snapshot);
      return {
        financeSnapshot: snapshot,
        accepted: {
          jars: snapshot.jars.length,
          transactions: snapshot.transactions.length,
        },
        serverTime: new Date().toISOString(),
      };
    },
    async applyBillingWebhook(payload = {}) {
      const email = normalizeEmail(payload.email);
      if (!email) return { error: { code: "VALIDATION_ERROR", message: "Email is required" } };
      const current = store.profiles.get(email) || { email, birthday: "", gender: "", setupComplete: false };
      const role = serverRoleForEmail(email, current.role || "user");
      const subscriptionPlan = serverPlanForRole(role, planFromBillingStatus(payload.status, payload.plan));
      const nextProfile = sanitizeProfile({
        ...current,
        role,
        subscriptionPlan,
        billingProvider: payload.provider,
        billingStatus: payload.status,
        updatedAt: new Date().toISOString(),
      });
      store.profiles.set(email, nextProfile);
      return {
        accepted: true,
        email,
        subscriptionPlan,
        provider: payload.provider || "unknown",
        serverTime: new Date().toISOString(),
      };
    },
    async appendAgentEvents(userId = "local-demo-user", events = []) {
      const normalizedEmail = normalizeEmail(userId);
      const normalizedEvents = events.map((event) => ({ ...event, profileEmail: event.profileEmail || normalizedEmail }));
      store.agentEvents.push(...normalizedEvents);
      store.agentEvents = store.agentEvents.slice(-2000);
      store.trainingRecords.push(...normalizedEvents.map((event) => ({ ...buildTrainingRecordFromAgentEvent(event), userId: normalizedEmail, profileEmail: normalizedEmail })));
      store.trainingRecords = store.trainingRecords.slice(-2000);
      return { accepted: normalizedEvents.length, rejected: 0 };
    },
    async syncPersistence(body = {}) {
      const userId = body.userId || body.profile?.email || "local-demo-user";
      if (body.profile) store.profiles.set(userId, { ...body.profile, updatedAt: new Date().toISOString() });
      if (body.financeSnapshot) store.financeSnapshots.set(userId, normalizeFinanceSnapshot({ userId, financeSnapshot: body.financeSnapshot }));
      if (Array.isArray(body.nutritionLogs)) {
        store.nutritionLogs.push(...body.nutritionLogs.map((item) => ({ ...item, userId })));
        store.nutritionLogs = store.nutritionLogs.slice(-2000);
      }
      if (Array.isArray(body.agentEvents)) {
        store.agentEvents.push(...body.agentEvents);
        store.agentEvents = store.agentEvents.slice(-2000);
      }
      if (Array.isArray(body.trainingRecords)) {
        store.trainingRecords.push(...body.trainingRecords);
        store.trainingRecords = store.trainingRecords.slice(-2000);
      }
      if (Array.isArray(body.foodLibrary) && body.foodLibrary.length) {
        const byId = new Map(store.foodLibrary.map((item) => [item.id, item]));
        body.foodLibrary.forEach((item) => byId.set(item.id, item));
        store.foodLibrary = [...byId.values()];
      }
      return {
        accepted: {
          profile: Boolean(body.profile),
          financeSnapshot: Boolean(body.financeSnapshot),
          nutritionLogs: Array.isArray(body.nutritionLogs) ? body.nutritionLogs.length : 0,
          agentEvents: Array.isArray(body.agentEvents) ? body.agentEvents.length : 0,
          trainingRecords: Array.isArray(body.trainingRecords) ? body.trainingRecords.length : 0,
          foodLibrary: Array.isArray(body.foodLibrary) ? body.foodLibrary.length : 0,
        },
        serverTime: new Date().toISOString(),
      };
    },
    async getAdminAnalytics() {
      return buildMemoryAnalytics(store);
    },
  };
}

async function createPostgresRepository() {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  async function ensureUser(profile = {}, userId = "local-demo-user") {
    const email = profile.email || (String(userId).includes("@") ? String(userId) : `${userId}@magerlife.local`);
    const role = serverRoleForEmail(email, profile.role || "user");
    const subscriptionPlan = serverPlanForRole(role, profile.subscriptionPlan || "free");
    const result = await pool.query(
      `
      insert into app_users (email, display_name, role, subscription_plan, last_active_at)
      values ($1, $2, $3, $4, now())
      on conflict (email) do update set
        display_name = coalesce(excluded.display_name, app_users.display_name),
        role = case when app_users.role = 'admin' then app_users.role else excluded.role end,
        subscription_plan = case when app_users.subscription_plan = 'pro' then app_users.subscription_plan else excluded.subscription_plan end,
        last_active_at = now(),
        updated_at = now()
      returning id
      `,
      [email, profile.name || null, role, subscriptionPlan]
    );
    return result.rows[0].id;
  }

  async function upsertProfile(userId, profile = {}) {
    await pool.query(
      `
      insert into user_profiles (
        user_id, birthday, gender, weight_kg, height_cm, salary, currency, food_monthly_budget,
        health_goal, current_priority, goal_summary, diet_preference, budget_style, support_style,
        calorie_note, preference_weights, extracted_signals, custom_choice_inputs, profile_payload,
        setup_complete, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20,now())
      on conflict (user_id) do update set
        birthday = excluded.birthday,
        gender = excluded.gender,
        weight_kg = excluded.weight_kg,
        height_cm = excluded.height_cm,
        salary = excluded.salary,
        currency = excluded.currency,
        food_monthly_budget = excluded.food_monthly_budget,
        health_goal = excluded.health_goal,
        current_priority = excluded.current_priority,
        goal_summary = excluded.goal_summary,
        diet_preference = excluded.diet_preference,
        budget_style = excluded.budget_style,
        support_style = excluded.support_style,
        calorie_note = excluded.calorie_note,
        preference_weights = excluded.preference_weights,
        extracted_signals = excluded.extracted_signals,
        custom_choice_inputs = excluded.custom_choice_inputs,
        profile_payload = excluded.profile_payload,
        setup_complete = excluded.setup_complete,
        updated_at = now()
      `,
      [
        userId,
        dateOrNull(profile.birthday),
        profile.gender || null,
        numberOrNull(profile.weight),
        numberOrNull(profile.height),
        numberOrNull(profile.salary),
        profile.currency || "VND",
        numberOrNull(profile.foodMonthlyBudget),
        profile.healthGoal || null,
        profile.currentPriority || null,
        profile.goalSummary || null,
        profile.dietPreference || null,
        profile.budgetStyle || null,
        profile.supportStyle || null,
        profile.calorieNote || null,
        json(profile.preferenceWeights, {}),
        json(profile.extractedSignals, {}),
        json(profile.customChoiceInputs, {}),
        json(profile, {}),
        Boolean(profile.setupComplete),
      ]
    );
    await upsertPendingNutritionRequests(userId, profile.pendingNutritionApiRequests || []);
  }

  async function upsertPendingNutritionRequests(userId, requests = []) {
    for (const request of requests) {
      if (!request?.id || !request?.text) continue;
      await pool.query(
        `
        insert into pending_nutrition_api_requests (external_id, user_id, text, meal, status, candidates, created_at, resolved_at)
        values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
        on conflict (external_id) do update set
          text = excluded.text,
          meal = excluded.meal,
          status = excluded.status,
          candidates = excluded.candidates,
          resolved_at = excluded.resolved_at
        `,
        [
          request.id,
          userId,
          request.text,
          request.meal || null,
          ["pending", "resolved", "rejected"].includes(request.status) ? request.status : "pending",
          json(request.candidates, []),
          request.createdAt || new Date().toISOString(),
          request.status === "resolved" || request.status === "rejected" ? new Date().toISOString() : null,
        ]
      );
    }
  }

  async function insertNutritionLogs(userId, logs = [], currency = "VND") {
    for (const meal of logs) {
      await pool.query(
        `
        insert into nutrition_meal_logs (external_id, user_id, meal, name, kcal, carbs, protein, fat, fiber, price, currency, source, created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (external_id) do update set
          meal = excluded.meal,
          name = excluded.name,
          kcal = excluded.kcal,
          carbs = excluded.carbs,
          protein = excluded.protein,
          fat = excluded.fat,
          fiber = excluded.fiber,
          price = excluded.price,
          currency = excluded.currency
        `,
        [
          meal.id || null,
          userId,
          meal.meal,
          meal.name,
          meal.kcal || 0,
          meal.carbs ?? null,
          meal.protein ?? null,
          meal.fat ?? null,
          meal.fiber ?? null,
          meal.price ?? null,
          currency,
          "chat",
          meal.createdAt || new Date().toISOString(),
        ]
      );
    }
  }

  async function insertAgentEvents(userId, events = []) {
    for (const event of events) {
      await pool.query(
        `
        insert into agent_events (external_id, user_id, event_type, source, payload, created_at)
        values ($1,$2,$3,$4,$5::jsonb,$6)
        on conflict (external_id) do update set
          event_type = excluded.event_type,
          source = excluded.source,
          payload = excluded.payload
        `,
        [event.id || null, userId, event.type || "agent_event", event.source || "unknown", json(event.payload, {}), event.createdAt || new Date().toISOString()]
      );
    }
  }

  async function insertTrainingRecords(userId, records = []) {
    for (const record of records) {
      await pool.query(
        `
        insert into agent_training_records (external_id, user_id, input, output, label, accepted, train_split, created_at)
        values ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8)
        on conflict (external_id) do update set
          input = excluded.input,
          output = excluded.output,
          label = excluded.label,
          accepted = excluded.accepted,
          train_split = excluded.train_split
        `,
        [
          record.id || null,
          userId,
          json(record.event || record.input, {}),
          json(record.output, {}),
          record.label || null,
          typeof record.accepted === "boolean" ? record.accepted : null,
          record.trainSplit || "candidate",
          record.createdAt || new Date().toISOString(),
        ]
      );
    }
  }

  async function upsertFoodLibrary(items = []) {
    for (const item of items) {
      const ownerUserId = item.source === "user" && item.ownerEmail ? await ensureUser({ email: item.ownerEmail }, item.ownerEmail) : null;
      await pool.query(
        `
        insert into food_library_items (
          external_id, owner_user_id, source, name, aliases, serving_amount, serving_unit, kcal_per_100,
          carbs_per_100, protein_per_100, fat_per_100, fiber_per_100, tags, verified, updated_at
        )
        values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,now())
        on conflict (external_id) do update set
          owner_user_id = excluded.owner_user_id,
          source = excluded.source,
          name = excluded.name,
          aliases = excluded.aliases,
          serving_amount = excluded.serving_amount,
          serving_unit = excluded.serving_unit,
          kcal_per_100 = excluded.kcal_per_100,
          carbs_per_100 = excluded.carbs_per_100,
          protein_per_100 = excluded.protein_per_100,
          fat_per_100 = excluded.fat_per_100,
          fiber_per_100 = excluded.fiber_per_100,
          tags = excluded.tags,
          verified = excluded.verified,
          updated_at = now()
        `,
        [
          item.id || null,
          ownerUserId,
          item.source || "admin",
          item.name,
          json(item.aliases, []),
          item.servingGram || 100,
          item.servingUnit || "g",
          item.kcalPer100g || 0,
          item.carbsPer100g || 0,
          item.proteinPer100g || 0,
          item.fatPer100g || 0,
          item.fiberPer100g || 0,
          json(item.tags, []),
          item.source === "admin",
        ]
      );
    }
  }

  async function selectFoodLibrary({ scope = "admin", userId } = {}) {
    const normalizedEmail = normalizeEmail(userId);
    const params = [];
    let where = "where f.source = 'admin'";
    if (scope === "user") {
      params.push(normalizedEmail);
      where = "where f.source = 'user' and ($1 = '' or u.email = $1)";
    }
    if (scope === "all") {
      params.push(normalizedEmail);
      where = "where f.source = 'admin' or ($1 <> '' and u.email = $1)";
    }
    const result = await pool.query(
      `
      select
        f.external_id as id,
        f.name,
        f.aliases,
        f.serving_amount as "servingGram",
        f.serving_unit as "servingUnit",
        f.kcal_per_100 as "kcalPer100g",
        f.carbs_per_100 as "carbsPer100g",
        f.protein_per_100 as "proteinPer100g",
        f.fat_per_100 as "fatPer100g",
        f.fiber_per_100 as "fiberPer100g",
        f.tags,
        f.source,
        u.email as "ownerEmail",
        f.updated_at as "updatedAt"
      from food_library_items f
      left join app_users u on u.id = f.owner_user_id
      ${where}
      order by f.updated_at desc
      limit 500
      `,
      params
    );
    return result.rows.map((item) => ({
      ...item,
      servingGram: Number(item.servingGram || 100),
      kcalPer100g: Number(item.kcalPer100g || 0),
      carbsPer100g: Number(item.carbsPer100g || 0),
      proteinPer100g: Number(item.proteinPer100g || 0),
      fatPer100g: Number(item.fatPer100g || 0),
      fiberPer100g: Number(item.fiberPer100g || 0),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
    }));
  }

  async function selectFinanceSnapshot(email) {
    const normalizedEmail = normalizeEmail(email);
    const userResult = await pool.query("select id, email from app_users where email = $1 limit 1", [normalizedEmail]);
    const user = userResult.rows[0];
    if (!user) return null;
    const jarResult = await pool.query(
      `
      select jar_key as id, name, emoji, percentage, balance, monthly_allocation as "monthlyAllocation", purpose_note as "purposeNote", linked_goals as "linkedGoals"
      from user_jars
      where user_id = $1
      order by created_at asc
      `,
      [user.id]
    );
    const txResult = await pool.query(
      `
      select
        t.external_id as id,
        j.jar_key as "jarId",
        t.type,
        t.amount,
        t.item_name as "itemName",
        t.spent_at as "spentAt",
        t.note
      from transactions t
      left join user_jars j on j.id = t.jar_id
      where t.user_id = $1 and t.external_id is not null
      order by t.spent_at desc
      limit 500
      `,
      [user.id]
    );
    const jars = jarResult.rows.map((jar) => ({
      ...jar,
      percentage: Number(jar.percentage || 0),
      balance: Number(jar.balance || 0),
      monthlyAllocation: Number(jar.monthlyAllocation || 0),
      purposeNote: jar.purposeNote || "",
      linkedGoals: jar.linkedGoals || [],
    }));
    const transactions = txResult.rows
      .filter((tx) => tx.jarId)
      .map((tx) => ({
        ...tx,
        amount: Number(tx.amount || 0),
        spentAt: tx.spentAt instanceof Date ? tx.spentAt.toISOString().slice(0, 16) : tx.spentAt,
        note: tx.note || "",
      }));
    return {
      userId: normalizedEmail,
      currency: "VND",
      jars,
      transactions,
      updatedAt: new Date().toISOString(),
    };
  }

  async function upsertFinanceSnapshotToPostgres(snapshot) {
    const userUuid = await ensureUser({ email: snapshot.userId, currency: snapshot.currency }, snapshot.userId);
    const jarIds = snapshot.jars.map((jar) => jar.id);
    const txIds = snapshot.transactions.map((tx) => tx.id);
    if (txIds.length) {
      await pool.query("delete from transactions where user_id = $1 and external_id is not null and not (external_id = any($2::text[]))", [userUuid, txIds]);
    } else {
      await pool.query("delete from transactions where user_id = $1 and external_id is not null", [userUuid]);
    }
    if (jarIds.length) {
      await pool.query("delete from user_jars where user_id = $1 and not (jar_key = any($2::text[]))", [userUuid, jarIds]);
    } else {
      await pool.query("delete from user_jars where user_id = $1", [userUuid]);
    }

    for (const jar of snapshot.jars) {
      await pool.query(
        `
        insert into user_jars (user_id, jar_key, name, emoji, percentage, balance, monthly_allocation, purpose_note, linked_goals, is_fixed, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,now())
        on conflict (user_id, jar_key) do update set
          name = excluded.name,
          emoji = excluded.emoji,
          percentage = excluded.percentage,
          balance = excluded.balance,
          monthly_allocation = excluded.monthly_allocation,
          purpose_note = excluded.purpose_note,
          linked_goals = excluded.linked_goals,
          is_fixed = excluded.is_fixed,
          updated_at = now()
        `,
        [
          userUuid,
          jar.id,
          jar.name,
          jar.emoji || null,
          numberOrNull(jar.percentage) || 0,
          numberOrNull(jar.balance) || 0,
          numberOrNull(jar.monthlyAllocation) || 0,
          jar.purposeNote || null,
          json(jar.linkedGoals, []),
          jar.id === "necessities" || String(jar.name || "").toLowerCase().includes("ăn uống"),
        ]
      );
    }

    const jarResult = await pool.query("select id, jar_key from user_jars where user_id = $1", [userUuid]);
    const jarUuidByKey = new Map(jarResult.rows.map((jar) => [jar.jar_key, jar.id]));
    for (const tx of snapshot.transactions) {
      const jarUuid = jarUuidByKey.get(tx.jarId);
      if (!jarUuid) continue;
      await pool.query(
        `
        insert into transactions (external_id, user_id, jar_id, type, amount, currency, item_name, spent_at, note)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (external_id) do update set
          jar_id = excluded.jar_id,
          type = excluded.type,
          amount = excluded.amount,
          currency = excluded.currency,
          item_name = excluded.item_name,
          spent_at = excluded.spent_at,
          note = excluded.note
        `,
        [
          tx.id,
          userUuid,
          jarUuid,
          tx.type === "income" ? "income" : "expense",
          numberOrNull(tx.amount) || 0,
          snapshot.currency || "VND",
          tx.itemName || "Giao dịch",
          tx.spentAt || new Date().toISOString(),
          tx.note || null,
        ]
      );
    }
  }

  async function getProfileByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    const result = await pool.query(
      `
      select
        u.id,
        u.email,
        u.display_name,
        u.role,
        u.subscription_plan,
        p.profile_payload,
        p.setup_complete
      from app_users u
      left join user_profiles p on p.user_id = u.id
      where u.email = $1
      limit 1
      `,
      [normalizedEmail]
    );
    const row = result.rows[0];
    if (!row) return null;
    return sanitizeProfile({
      ...(row.profile_payload || {}),
      email: row.email,
      name: row.display_name || row.profile_payload?.name,
      role: row.role || "user",
      subscriptionPlan: row.subscription_plan || "free",
      setupComplete: Boolean(row.setup_complete ?? row.profile_payload?.setupComplete),
    });
  }

  return {
    driver: "postgres",
    async registerAccount({ email, password, profile = {} } = {}) {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail || !password) return { error: { code: "VALIDATION_ERROR", message: "Email and password are required" } };
      const existing = await pool.query("select id from app_users where email = $1 limit 1", [normalizedEmail]);
      if (existing.rows[0]) return { error: { code: "ACCOUNT_EXISTS", message: "Account already exists" } };
      const { hash, salt } = hashPassword(password);
      const role = serverRoleForEmail(normalizedEmail);
      const subscriptionPlan = serverPlanForRole(role);
      const userResult = await pool.query(
        `
        insert into app_users (email, display_name, password_hash, password_salt, role, subscription_plan, last_active_at)
        values ($1, $2, $3, $4, $5, $6, now())
        returning id
        `,
        [normalizedEmail, profile.name || null, hash, salt, role, subscriptionPlan]
      );
      const userId = userResult.rows[0].id;
      const nextProfile = sanitizeProfile({
        ...profile,
        email: normalizedEmail,
        role,
        subscriptionPlan,
        setupComplete: Boolean(profile.setupComplete),
      });
      await upsertProfile(userId, nextProfile);
      return { userId: normalizedEmail, profile: nextProfile, token: createSessionToken(normalizedEmail, nextProfile.role) };
    },
    async loginAccount({ identifier, password } = {}) {
      const normalizedEmail = normalizeEmail(identifier);
      const result = await pool.query(
        "select password_hash, password_salt from app_users where email = $1 and status = 'active' limit 1",
        [normalizedEmail]
      );
      const account = result.rows[0];
      if (!account || !verifyPassword(password, account.password_salt, account.password_hash)) {
        return { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };
      }
      if (isBootstrapAdminEmail(normalizedEmail)) {
        await pool.query("update app_users set role = 'admin', subscription_plan = 'pro', updated_at = now() where email = $1", [normalizedEmail]);
      }
      await pool.query("update app_users set last_active_at = now(), updated_at = now() where email = $1", [normalizedEmail]);
      const profile = await getProfileByEmail(normalizedEmail);
      return {
        userId: normalizedEmail,
        profile: profile || sanitizeProfile({ email: normalizedEmail, birthday: "", gender: "", setupComplete: false }),
        token: createSessionToken(normalizedEmail, profile?.role),
      };
    },
    async getProfile(userId) {
      return { profile: await getProfileByEmail(userId) };
    },
    async patchProfile({ userId, patch = {} } = {}) {
      const normalizedEmail = normalizeEmail(userId || patch.email);
      const current = (await getProfileByEmail(normalizedEmail)) || sanitizeProfile({ email: normalizedEmail, birthday: "", gender: "", setupComplete: false });
      const userUuid = await ensureUser(current, normalizedEmail);
      const nextProfile = sanitizeProfile({
        ...applyClientProfilePatch(current, patch),
        email: normalizedEmail,
      });
      await upsertProfile(userUuid, nextProfile);
      return { profile: nextProfile, changedFields: Object.keys(patch) };
    },
    async logNutritionMeal({ userId, mealLog } = {}) {
      const normalizedEmail = normalizeEmail(userId);
      if (!mealLog?.id) return { error: { code: "VALIDATION_ERROR", message: "mealLog is required" } };
      const current = (await getProfileByEmail(normalizedEmail)) || sanitizeProfile({ email: normalizedEmail, birthday: "", gender: "", setupComplete: false });
      const userUuid = await ensureUser(current, normalizedEmail);
      await insertNutritionLogs(userUuid, [mealLog], current.currency || "VND");
      const nextMeals = [...(current.nutritionMeals || []).filter((meal) => meal.id !== mealLog.id), mealLog];
      await upsertProfile(userUuid, { ...current, nutritionMeals: nextMeals });
      return { mealLog, accepted: true };
    },
    async getFoodLibrary(payload = {}) {
      return { items: await selectFoodLibrary(payload), serverTime: new Date().toISOString() };
    },
    async upsertFoodLibrary({ items = [], userId } = {}) {
      const normalizedEmail = normalizeEmail(userId);
      const incoming = normalizeFoodItems(items).map((item) => item.source === "user" ? { ...item, ownerEmail: item.ownerEmail || normalizedEmail } : item);
      await upsertFoodLibrary(incoming);
      return { accepted: incoming.length, items: incoming, serverTime: new Date().toISOString() };
    },
    async getFinanceSnapshot(userId) {
      return { financeSnapshot: await selectFinanceSnapshot(userId) };
    },
    async upsertFinanceSnapshot(payload = {}) {
      const snapshot = normalizeFinanceSnapshot(payload);
      await upsertFinanceSnapshotToPostgres(snapshot);
      return {
        financeSnapshot: snapshot,
        accepted: {
          jars: snapshot.jars.length,
          transactions: snapshot.transactions.length,
        },
        serverTime: new Date().toISOString(),
      };
    },
    async applyBillingWebhook(payload = {}) {
      const email = normalizeEmail(payload.email);
      if (!email) return { error: { code: "VALIDATION_ERROR", message: "Email is required" } };
      const current = (await getProfileByEmail(email)) || sanitizeProfile({ email, birthday: "", gender: "", setupComplete: false });
      const role = serverRoleForEmail(email, current.role || "user");
      const subscriptionPlan = serverPlanForRole(role, planFromBillingStatus(payload.status, payload.plan));
      const userUuid = await ensureUser({ ...current, role, subscriptionPlan }, email);
      await pool.query(
        "update app_users set role = $1, subscription_plan = $2, updated_at = now(), last_active_at = now() where id = $3",
        [role, subscriptionPlan, userUuid]
      );
      await upsertProfile(userUuid, {
        ...current,
        role,
        subscriptionPlan,
        billingProvider: payload.provider,
        billingStatus: payload.status,
        billingExternalSubscriptionId: payload.externalSubscriptionId,
      });
      return {
        accepted: true,
        email,
        subscriptionPlan,
        provider: payload.provider || "unknown",
        serverTime: new Date().toISOString(),
      };
    },
    async appendAgentEvents(userId = "local-demo-user", events = []) {
      const userUuid = await ensureUser({}, userId);
      const normalizedEmail = normalizeEmail(userId);
      const normalizedEvents = events.map((event) => ({ ...event, profileEmail: event.profileEmail || normalizedEmail }));
      await insertAgentEvents(userUuid, normalizedEvents);
      await insertTrainingRecords(userUuid, normalizedEvents.map(buildTrainingRecordFromAgentEvent));
      return { accepted: normalizedEvents.length, rejected: 0 };
    },
    async syncPersistence(body = {}) {
      const userId = await ensureUser(body.profile || {}, body.userId);
      if (body.profile) await upsertProfile(userId, body.profile);
      if (body.financeSnapshot) await upsertFinanceSnapshotToPostgres(normalizeFinanceSnapshot({ userId: body.profile?.email || body.userId, financeSnapshot: body.financeSnapshot }));
      await insertNutritionLogs(userId, body.nutritionLogs || [], body.profile?.currency || "VND");
      await insertAgentEvents(userId, body.agentEvents || []);
      await insertTrainingRecords(userId, body.trainingRecords || []);
      await upsertFoodLibrary(body.foodLibrary || []);
      return {
        accepted: {
          profile: Boolean(body.profile),
          financeSnapshot: Boolean(body.financeSnapshot),
          nutritionLogs: Array.isArray(body.nutritionLogs) ? body.nutritionLogs.length : 0,
          agentEvents: Array.isArray(body.agentEvents) ? body.agentEvents.length : 0,
          trainingRecords: Array.isArray(body.trainingRecords) ? body.trainingRecords.length : 0,
          foodLibrary: Array.isArray(body.foodLibrary) ? body.foodLibrary.length : 0,
        },
        serverTime: new Date().toISOString(),
      };
    },
    async getAdminAnalytics() {
      const usersResult = await pool.query(
        `
        select id, email, display_name, role, subscription_plan, created_at, updated_at, last_active_at
        from app_users
        order by created_at desc
        limit 200
        `
      );
      const countsResult = await pool.query(
        `
        select
          count(*)::int as total_users,
          count(*) filter (where subscription_plan = 'pro')::int as paid_users,
          count(*) filter (where last_active_at > now() - interval '30 days')::int as active_users
        from app_users
        `
      );
      const foodResult = await pool.query("select count(*)::int as count from food_library_items");
      const eventResult = await pool.query("select count(*)::int as count from agent_events");
      const pendingResult = await pool.query("select count(*)::int as count from pending_nutrition_api_requests where status = 'pending'");
      const recentEvents = await pool.query(
        "select external_id as id, event_type as type, source, payload, created_at as \"createdAt\" from agent_events order by created_at desc limit 20"
      );
      const training = await pool.query(
        "select external_id as id, input, output, label, accepted, train_split as \"trainSplit\", created_at as \"createdAt\" from agent_training_records order by created_at desc limit 200"
      );
      const row = countsResult.rows[0] || {};
      const users = usersResult.rows.map((user) => ({
        id: user.id,
        email: user.email,
        profile: { email: user.email, name: user.display_name, role: user.role, subscriptionPlan: user.subscription_plan },
        role: user.role,
        subscriptionPlan: user.subscription_plan,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        lastActiveAt: user.last_active_at,
      }));
      const planCounts = users.reduce(
        (acc, user) => {
          acc[user.subscriptionPlan || "free"] += 1;
          return acc;
        },
        { free: 0, pro: 0 }
      );
      return {
        analytics: {
          totalUsers: row.total_users || 0,
          paidUsers: row.paid_users || 0,
          activeUsers: row.active_users || 0,
          revenue: (row.paid_users || 0) * 149000,
          planCounts,
          foodLibraryCount: foodResult.rows[0]?.count || 0,
          pendingFoodRequests: pendingResult.rows[0]?.count || 0,
          agentEventCount: eventResult.rows[0]?.count || 0,
        },
        users,
        recentEvents: recentEvents.rows,
        trainingRecords: training.rows,
      };
    },
  };
}

export async function createPersistenceRepository() {
  if (process.env.MAGERLIFE_DB_DRIVER === "postgres" && process.env.DATABASE_URL) {
    try {
      return await createPostgresRepository();
    } catch (error) {
      console.warn(`Postgres adapter unavailable, falling back to memory: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  return createMemoryRepository();
}
