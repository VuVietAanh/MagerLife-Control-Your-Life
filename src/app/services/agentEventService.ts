export const AGENT_EVENT_STORAGE_KEY = "magerlife.agent.events.v1";

export type AgentEventType =
  | "auth_completed"
  | "profile_updated"
  | "nutrition_logged"
  | "nutrition_api_pending"
  | "food_library_updated"
  | "preference_changed"
  | "agent_decision";

export type AgentEvent = {
  id: string;
  type: AgentEventType;
  source: string;
  createdAt: string;
  profileEmail?: string;
  payload: Record<string, unknown>;
};

export function loadAgentEvents(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return [] as AgentEvent[];
  try {
    const raw = storage.getItem(AGENT_EVENT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AgentEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveAgentEvents(
  events: AgentEvent[],
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return;
  try {
    storage.setItem(AGENT_EVENT_STORAGE_KEY, JSON.stringify(events.slice(-300)));
  } catch {
    // Local demo storage can fail in private mode.
  }
}

export function appendAgentEvent(
  event: Omit<AgentEvent, "id" | "createdAt">,
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  const nextEvent: AgentEvent = {
    ...event,
    id: `${Date.now()}-${event.type}`,
    createdAt: new Date().toISOString(),
  };
  const events = loadAgentEvents(storage);
  saveAgentEvents([...events, nextEvent], storage);
  return nextEvent;
}

export function classifyProfileUpdateEvent(patch: Record<string, unknown>, sourceText = ""): AgentEventType {
  if (sourceText.toLowerCase().includes("api/llm")) return "agent_decision";
  if (patch.nutritionMeals) return "nutrition_logged";
  if (patch.pendingNutritionApiRequests) return "nutrition_api_pending";
  if (patch.customFoodItems) return "food_library_updated";
  if (patch.nutritionDietMode || patch.nutritionTrackingMode || patch.preferenceWeights) return "preference_changed";
  return "profile_updated";
}
