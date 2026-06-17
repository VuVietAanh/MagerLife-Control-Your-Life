import type { FoodLibraryItem } from "./foodLibraryService";
import type { AgentEvent } from "./agentEventService";
import { callMagerLifeApi, type ApiClientOptions } from "./apiClient";
import type { NutritionApiRequest } from "./nutritionApiService";
import { createPendingNutritionApiRequest } from "./nutritionApiService";
import { resolveNutritionFromFoodLibrary, type ResolvedNutrition } from "./nutritionResolver";
import { parseProfilePatchFromText } from "./profileService";
import { fetchWeatherForecast, type WeatherPlace } from "./weatherService";
import type { MoneyCurrency } from "../models/finance";
import type { NutritionMealLog } from "../models/nutrition";
import type { UserProfile } from "../models/profile";
import type { AgentTrainingRecord, UserFinanceSnapshot } from "../models/storageSchema";

export type ResolveFoodFromTextResult = {
  status: "matched" | "pending_api";
  nutrition?: ResolvedNutrition;
  pendingRequest?: NutritionApiRequest;
};

export function resolveFoodFromText({
  text,
  meal,
  profile,
  adminFoodLibrary,
}: {
  text: string;
  meal: NutritionMealLog["meal"];
  profile: UserProfile | null;
  adminFoodLibrary: FoodLibraryItem[];
}): ResolveFoodFromTextResult {
  const nutrition = resolveNutritionFromFoodLibrary(text, [...(profile?.customFoodItems || []), ...adminFoodLibrary]);
  if (nutrition) {
    return {
      status: "matched",
      nutrition,
    };
  }
  return {
    status: "pending_api",
    pendingRequest: createPendingNutritionApiRequest(text, meal),
  };
}

export function extractProfileFromChat(text: string, profile: UserProfile | null) {
  return parseProfilePatchFromText<UserProfile>(text, profile);
}

export function saveMealLog(profile: UserProfile | null, mealLog: NutritionMealLog) {
  return {
    nutritionMeals: [...(profile?.nutritionMeals || []), mealLog],
  } satisfies Partial<UserProfile>;
}

export function createAdminFood(food: FoodLibraryItem) {
  return {
    ...food,
    source: "admin" as const,
    updatedAt: new Date().toISOString(),
  };
}

export function createUserFood(food: FoodLibraryItem, profile: UserProfile | null) {
  return {
    ...food,
    source: "user" as const,
    ownerEmail: profile?.email,
    updatedAt: new Date().toISOString(),
  };
}

export async function getWeather(place: WeatherPlace) {
  return fetchWeatherForecast(place);
}

export async function getApiHealth(options?: ApiClientOptions) {
  return callMagerLifeApi("GET /health", {}, options);
}

export async function registerAccountViaApi({
  email,
  password,
  profile,
  options,
}: {
  email: string;
  password: string;
  profile: Partial<UserProfile>;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /auth/register",
    {
      email,
      password,
      profile,
    },
    options
  );
}

export async function loginAccountViaApi({
  identifier,
  password,
  options,
}: {
  identifier: string;
  password: string;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /auth/login",
    {
      identifier,
      password,
    },
    options
  );
}

export async function saveProfileToApi({
  userId,
  patch,
  options,
}: {
  userId: string;
  patch: Partial<UserProfile>;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "PATCH /profile",
    {
      userId,
      patch,
    },
    options
  );
}

export async function logNutritionMealToApi({
  userId,
  mealLog,
  options,
}: {
  userId: string;
  mealLog: NutritionMealLog;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /nutrition/log",
    {
      userId,
      mealLog,
    },
    options
  );
}

export async function getFoodLibraryFromApi({
  scope = "admin",
  userId,
  options,
}: {
  scope?: "admin" | "user" | "all";
  userId?: string;
  options?: ApiClientOptions;
} = {}) {
  return callMagerLifeApi(
    "GET /food-library",
    {
      scope,
      userId,
    },
    options
  );
}

export async function saveFoodLibraryToApi({
  userId,
  items,
  options,
}: {
  userId: string;
  items: FoodLibraryItem[];
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /food-library",
    {
      userId,
      items,
    },
    options
  );
}

export async function getFinanceSnapshotFromApi({
  userId,
  options,
}: {
  userId: string;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "GET /finance/snapshot",
    {
      userId,
    },
    options
  );
}

export async function saveFinanceSnapshotToApi({
  userId,
  financeSnapshot,
  options,
}: {
  userId: string;
  financeSnapshot: UserFinanceSnapshot;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "PUT /finance/snapshot",
    {
      userId,
      financeSnapshot,
    },
    options
  );
}

export async function syncAgentEventsToApi({
  userId,
  events,
  options,
}: {
  userId: string;
  events: AgentEvent[];
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /agent/events",
    {
      userId,
      events,
    },
    options
  );
}

export async function sendChatTurnToApi({
  text,
  profile,
  currency,
  activeTab = "dashboard",
  options,
}: {
  text: string;
  profile: UserProfile | null;
  currency: MoneyCurrency;
  activeTab?: string;
  options?: ApiClientOptions;
}) {
  if (!profile) {
    return {
      ok: false as const,
      error: { code: "NO_PROFILE", message: "Profile is required before calling chat API" },
    };
  }
  return callMagerLifeApi(
    "POST /chat/turn",
    {
      userId: profile.email || "local-demo-user",
      text,
      profile,
      clientContext: {
        currency,
        activeTab,
        localTime: new Date().toISOString(),
      },
    },
    options
  );
}

export async function updateProfileViaApi({
  profile,
  patch,
  sourceText,
  options,
}: {
  profile: UserProfile;
  patch: Partial<UserProfile>;
  sourceText: string;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /profile/update",
    {
      userId: profile.email || "local-demo-user",
      profile,
      patch,
      sourceText,
    },
    options
  );
}

export async function syncPersistenceSnapshotToApi({
  userId,
  profile,
  financeSnapshot,
  nutritionLogs = [],
  agentEvents = [],
  trainingRecords = [],
  foodLibrary = [],
  options,
}: {
  userId: string;
  profile?: UserProfile;
  financeSnapshot?: UserFinanceSnapshot;
  nutritionLogs?: NutritionMealLog[];
  agentEvents?: AgentEvent[];
  trainingRecords?: AgentTrainingRecord[];
  foodLibrary?: FoodLibraryItem[];
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /persistence/sync",
    {
      userId,
      profile,
      financeSnapshot,
      nutritionLogs,
      agentEvents,
      trainingRecords,
      foodLibrary,
    },
    options
  );
}

export async function getAdminAnalyticsFromApi({
  adminUserId,
  options,
}: {
  adminUserId: string;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "GET /admin/analytics",
    {
      adminUserId,
    },
    options
  );
}

export async function getBillingProvidersFromApi(options?: ApiClientOptions) {
  return callMagerLifeApi("GET /billing/providers", {}, options);
}

export async function createBillingCheckoutViaApi({
  userId,
  provider,
  plan = "pro",
  returnUrl,
  cancelUrl,
  options,
}: {
  userId: string;
  provider: "payos" | "momo" | "vnpay";
  plan?: "pro";
  returnUrl?: string;
  cancelUrl?: string;
  options?: ApiClientOptions;
}) {
  return callMagerLifeApi(
    "POST /billing/checkout",
    {
      userId,
      provider,
      plan,
      returnUrl,
      cancelUrl,
    },
    options
  );
}
