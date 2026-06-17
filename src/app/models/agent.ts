export type Memory = {
  id: string;
  category: "finance" | "health" | "goal" | "preference" | "state";
  content: string;
  source: "user_input" | "inferred" | "calculated" | "chat";
  confidence: number;
  lastVerified: string;
};

export type Message = {
  role: "user" | "ai";
  text: string;
};

export type AgentDecisionLog = {
  id: string;
  agent: "Meal Agent" | "Finance Agent" | "Planner Agent" | "Chat Agent" | "Profile Agent";
  input: string;
  rulesFired: string[];
  apiCalled: boolean;
  route: string;
  suggestion: string;
  confidence: number;
  userAction: "pending" | "accepted" | "rejected" | "not_required";
  factors: Array<{
    label: string;
    value: number;
  }>;
  createdAt: string;
};
