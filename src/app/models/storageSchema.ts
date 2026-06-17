import type { AgentEvent } from "../services/agentEventService";
import type { FoodLibraryItem } from "../services/foodLibraryService";
import type { Jar, Transaction } from "./finance";
import type { UserProfile } from "./profile";

export type AppUserRole = "user" | "admin";
export type AppSubscriptionPlan = "free" | "pro";

export type UserAccountRecord = {
  id: string;
  email: string;
  profile: UserProfile;
  role: AppUserRole;
  subscriptionPlan: AppSubscriptionPlan;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
};

export type UserFinanceSnapshot = {
  userId: string;
  currency: UserProfile["currency"];
  jars: Jar[];
  transactions: Transaction[];
  updatedAt: string;
};

export type AgentTrainingRecord = {
  id: string;
  userId?: string;
  profileEmail?: string;
  event: AgentEvent;
  accepted?: boolean;
  label?: string;
  trainSplit?: "candidate" | "train" | "validation" | "holdout";
  createdAt: string;
};

export type AdminAnalyticsSnapshot = {
  totalUsers: number;
  paidUsers: number;
  activeUsers: number;
  revenue: number;
  planCounts: Record<AppSubscriptionPlan, number>;
  foodLibraryCount: number;
  pendingFoodRequests: number;
  agentEventCount: number;
};

export type MagerLifeDataSchema = {
  users: UserAccountRecord[];
  foodLibrary: FoodLibraryItem[];
  agentTrainingRecords: AgentTrainingRecord[];
  financeSnapshots: UserFinanceSnapshot[];
};
