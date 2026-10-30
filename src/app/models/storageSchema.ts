import type { AgentEvent } from "../services/agentEventService";
import type { Jar, Transaction } from "./finance";
import type { UserProfile } from "./profile";

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
