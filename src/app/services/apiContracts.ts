import type { AgentEvent } from "./agentEventService";
import type { FoodLibraryItem } from "./foodLibraryService";
import type { MoneyCurrency } from "../models/finance";
import type { NutritionMealLog } from "../models/nutrition";
import type { UserProfile } from "../models/profile";
import type { AdminAnalyticsSnapshot, AgentTrainingRecord, UserAccountRecord, UserFinanceSnapshot } from "../models/storageSchema";
import type { WeatherData, WeatherPlace } from "./weatherService";

export type ApiResult<TData> = {
  ok: boolean;
  data?: TData;
  error?: {
    code: string;
    message: string;
  };
};

export type AuthRegisterRequest = {
  email: string;
  password: string;
  profile: Partial<UserProfile>;
};

export type AuthLoginRequest = {
  identifier: string;
  password: string;
};

export type AuthSessionResponse = {
  userId: string;
  profile: UserProfile;
  token: string;
};

export type MeRequest = {
  userId: string;
};

export type MeResponse = {
  profile: UserProfile | null;
};

export type ProfilePatchRequest = {
  userId: string;
  patch: Partial<UserProfile>;
};

export type ProfilePatchResponse = {
  profile: UserProfile;
  changedFields: string[];
};

export type ChatTurnRequest = {
  userId: string;
  text: string;
  profile: UserProfile;
  clientContext: {
    currency: MoneyCurrency;
    activeTab: string;
    localTime: string;
  };
};

export type ChatTurnResponse = {
  message: string;
  profilePatch?: Partial<UserProfile>;
  nutritionMeal?: NutritionMealLog;
  pendingAction?: {
    type: "resolve_food" | "confirm_profile_update" | "upgrade_required";
    reason: string;
  };
};

export type ResolveFoodRequest = {
  userId: string;
  text: string;
  meal?: NutritionMealLog["meal"];
  profile?: UserProfile;
  userFoodLibrary?: FoodLibraryItem[];
  adminFoodLibraryVersion?: string;
};

export type ResolveFoodResponse = {
  status: "matched" | "needs_confirmation" | "not_found";
  candidates: Array<{
    name: string;
    confidence: number;
    kcal: number;
    carbs?: number;
    protein?: number;
    fat?: number;
    fiber?: number;
    source: "admin_library" | "user_library" | "llm_estimate" | "external_api";
  }>;
};

export type NutritionLogRequest = {
  userId: string;
  mealLog: NutritionMealLog;
};

export type NutritionLogResponse = {
  mealLog: NutritionMealLog;
  accepted: boolean;
};

export type FoodLibraryRequest = {
  scope?: "admin" | "user" | "all";
  userId?: string;
};

export type FoodLibraryResponse = {
  items: FoodLibraryItem[];
  serverTime: string;
};

export type FoodLibraryUpsertRequest = {
  userId: string;
  items: FoodLibraryItem[];
};

export type FoodLibraryUpsertResponse = {
  accepted: number;
  items: FoodLibraryItem[];
  serverTime: string;
};

export type FinanceSnapshotRequest = {
  userId: string;
};

export type FinanceSnapshotResponse = {
  financeSnapshot: UserFinanceSnapshot | null;
};

export type FinanceSnapshotUpsertRequest = {
  userId: string;
  financeSnapshot: UserFinanceSnapshot;
};

export type FinanceSnapshotUpsertResponse = {
  financeSnapshot: UserFinanceSnapshot;
  accepted: {
    jars: number;
    transactions: number;
  };
  serverTime: string;
};

export type ProfileUpdateRequest = {
  userId: string;
  patch: Partial<UserProfile>;
  sourceText: string;
  profile?: UserProfile;
};

export type ProfileUpdateResponse = {
  profile: UserProfile;
  changedFields: string[];
  warnings: string[];
};

export type WeatherRequest = {
  userId: string;
  place: Pick<WeatherPlace, "name" | "latitude" | "longitude" | "isCurrent">;
};

export type WeatherResponse = {
  place: WeatherPlace;
  weather: WeatherData;
};

export type AgentEventsRequest = {
  userId: string;
  events: AgentEvent[];
};

export type AgentEventsResponse = {
  accepted: number;
  rejected: number;
  nextCursor?: string;
};

export type PersistenceSyncRequest = {
  userId: string;
  profile?: UserProfile;
  financeSnapshot?: UserFinanceSnapshot;
  nutritionLogs?: NutritionMealLog[];
  agentEvents?: AgentEvent[];
  trainingRecords?: AgentTrainingRecord[];
  foodLibrary?: FoodLibraryItem[];
};

export type PersistenceSyncResponse = {
  accepted: {
    profile: boolean;
    financeSnapshot: boolean;
    nutritionLogs: number;
    agentEvents: number;
    trainingRecords: number;
    foodLibrary: number;
  };
  serverTime: string;
};

export type AdminAnalyticsRequest = {
  adminUserId: string;
};

export type AdminAnalyticsResponse = {
  analytics: AdminAnalyticsSnapshot;
  users: UserAccountRecord[];
  recentEvents: AgentEvent[];
  trainingRecords: AgentTrainingRecord[];
};

export type BillingWebhookRequest = {
  email: string;
  provider: "stripe" | "payos" | "momo" | "vnpay" | "manual" | string;
  status: "active" | "paid" | "trialing" | "canceled" | "expired" | "refunded" | string;
  plan?: "free" | "pro";
  amount?: number;
  currency?: MoneyCurrency;
  externalSubscriptionId?: string;
  eventId?: string;
};

export type BillingWebhookResponse = {
  accepted: boolean;
  email: string;
  subscriptionPlan: "free" | "pro";
  provider: string;
  serverTime: string;
};

export type BillingProviderName = "payos" | "momo" | "vnpay";

export type BillingProvidersRequest = Record<string, never>;

export type BillingProvidersResponse = {
  providers: Record<BillingProviderName, {
    configured: boolean;
    requiredEnv: string[];
  }>;
};

export type BillingCheckoutRequest = {
  userId: string;
  provider: BillingProviderName;
  plan: "pro";
  returnUrl?: string;
  cancelUrl?: string;
};

export type BillingCheckoutResponse = {
  provider: BillingProviderName;
  checkoutUrl: string;
  orderId: string;
  amount: number;
  raw?: unknown;
};

export type ApiHealthRequest = Record<string, never>;

export type ApiHealthResponse = {
  ok: boolean;
  provider: "groq" | "xai" | "mock" | string;
  model?: string;
  llmConfigured: boolean;
  serverTime: string;
};

export type ApiDbHealthResponse = {
  ok: boolean;
  driver: "memory" | "postgres" | string;
  database?: {
    configured: boolean;
    host: string;
    port: string;
    pooler: boolean;
  };
  connection?: {
    ok: boolean;
    driver: "memory" | "postgres" | string;
    schemaReady: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
  serverTime: string;
};

export type ApiEndpointMap = {
  "GET /health": {
    request: ApiHealthRequest;
    response: ApiHealthResponse;
  };
  "GET /health/db": {
    request: ApiHealthRequest;
    response: ApiDbHealthResponse;
  };
  "POST /auth/register": {
    request: AuthRegisterRequest;
    response: AuthSessionResponse;
  };
  "POST /auth/login": {
    request: AuthLoginRequest;
    response: AuthSessionResponse;
  };
  "GET /me": {
    request: MeRequest;
    response: MeResponse;
  };
  "PATCH /profile": {
    request: ProfilePatchRequest;
    response: ProfilePatchResponse;
  };
  "POST /chat/turn": {
    request: ChatTurnRequest;
    response: ChatTurnResponse;
  };
  "POST /nutrition/resolve-food": {
    request: ResolveFoodRequest;
    response: ResolveFoodResponse;
  };
  "POST /nutrition/log": {
    request: NutritionLogRequest;
    response: NutritionLogResponse;
  };
  "GET /food-library": {
    request: FoodLibraryRequest;
    response: FoodLibraryResponse;
  };
  "POST /food-library": {
    request: FoodLibraryUpsertRequest;
    response: FoodLibraryUpsertResponse;
  };
  "GET /finance/snapshot": {
    request: FinanceSnapshotRequest;
    response: FinanceSnapshotResponse;
  };
  "PUT /finance/snapshot": {
    request: FinanceSnapshotUpsertRequest;
    response: FinanceSnapshotUpsertResponse;
  };
  "POST /profile/update": {
    request: ProfileUpdateRequest;
    response: ProfileUpdateResponse;
  };
  "GET /weather": {
    request: WeatherRequest;
    response: WeatherResponse;
  };
  "POST /agent/events": {
    request: AgentEventsRequest;
    response: AgentEventsResponse;
  };
  "POST /persistence/sync": {
    request: PersistenceSyncRequest;
    response: PersistenceSyncResponse;
  };
  "GET /admin/analytics": {
    request: AdminAnalyticsRequest;
    response: AdminAnalyticsResponse;
  };
  "POST /billing/webhook": {
    request: BillingWebhookRequest;
    response: BillingWebhookResponse;
  };
  "GET /billing/providers": {
    request: BillingProvidersRequest;
    response: BillingProvidersResponse;
  };
  "POST /billing/checkout": {
    request: BillingCheckoutRequest;
    response: BillingCheckoutResponse;
  };
};
