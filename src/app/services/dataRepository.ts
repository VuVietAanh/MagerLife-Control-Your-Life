import type { AgentEvent } from "./agentEventService";
import { loadAuthAccounts } from "./authAccountService";
import type { FoodLibraryItem } from "./foodLibraryService";
import type { AdminAnalyticsSnapshot, AgentTrainingRecord, MagerLifeDataSchema, UserAccountRecord } from "../models/storageSchema";
import type { UserProfile } from "../models/profile";

const TRAINING_RECORD_STORAGE_KEY = "magerlife.agent.training.records.v1";

export function loadUserAccountRecords(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
): UserAccountRecord[] {
  const accounts = loadAuthAccounts<UserProfile>(storage);
  return Object.entries(accounts).map(([key, profile]) => ({
    id: key,
    email: profile.email || key,
    profile,
    role: profile.role || "user",
    subscriptionPlan: profile.subscriptionPlan || "free",
    createdAt: profile.setupComplete ? new Date().toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  }));
}

export function loadAgentTrainingRecords(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return [] as AgentTrainingRecord[];
  try {
    const raw = storage.getItem(TRAINING_RECORD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgentTrainingRecord[]) : [];
  } catch {
    return [] as AgentTrainingRecord[];
  }
}

export function saveAgentTrainingRecords(
  records: AgentTrainingRecord[],
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return;
  try {
    storage.setItem(TRAINING_RECORD_STORAGE_KEY, JSON.stringify(records.slice(-1000)));
  } catch {
    // Local demo storage can fail in private mode.
  }
}

export function buildTrainingRecordFromEvent(event: AgentEvent): AgentTrainingRecord {
  return {
    id: `${event.id}-training`,
    profileEmail: event.profileEmail,
    event,
    accepted: event.type !== "nutrition_api_pending",
    trainSplit: "candidate",
    createdAt: new Date().toISOString(),
  };
}

export function appendAgentTrainingRecord(
  event: AgentEvent,
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  const nextRecord = buildTrainingRecordFromEvent(event);
  const records = loadAgentTrainingRecords(storage);
  saveAgentTrainingRecords([...records, nextRecord], storage);
  return nextRecord;
}

export function buildAdminAnalyticsSnapshot({
  users,
  foodLibrary,
  agentEvents,
}: {
  users: UserAccountRecord[];
  foodLibrary: FoodLibraryItem[];
  agentEvents: AgentEvent[];
}): AdminAnalyticsSnapshot {
  const planCounts = users.reduce(
    (acc, user) => {
      acc[user.subscriptionPlan || "free"] += 1;
      return acc;
    },
    { free: 0, pro: 0 }
  );
  const proPrice = 149_000;
  return {
    totalUsers: users.length,
    paidUsers: planCounts.pro,
    activeUsers: Math.max(0, Math.round(users.length * 0.82)),
    revenue: planCounts.pro * proPrice,
    planCounts,
    foodLibraryCount: foodLibrary.length,
    pendingFoodRequests: agentEvents.filter((event) => event.type === "nutrition_api_pending").length,
    agentEventCount: agentEvents.length,
  };
}

export function buildLocalDataSchemaSnapshot({
  foodLibrary,
  agentEvents,
}: {
  foodLibrary: FoodLibraryItem[];
  agentEvents: AgentEvent[];
}): MagerLifeDataSchema {
  const users = loadUserAccountRecords();
  const trainingRecords = loadAgentTrainingRecords();
  return {
    users,
    foodLibrary,
    agentTrainingRecords: trainingRecords.length
      ? trainingRecords
      : agentEvents.map((event) => buildTrainingRecordFromEvent(event)),
    financeSnapshots: [],
  };
}
