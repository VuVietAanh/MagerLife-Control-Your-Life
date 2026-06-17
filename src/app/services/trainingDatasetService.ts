import type { AgentEvent } from "./agentEventService";

export type AgentTrainingSample = {
  input: string;
  context: {
    eventType: AgentEvent["type"];
    profileEmail?: string;
    source: string;
    payload: Record<string, unknown>;
  };
  label: {
    accepted: boolean | null;
    action: string;
  };
  metadata: {
    eventId: string;
    createdAt: string;
    schemaVersion: "magerlife.training.v1";
  };
};

function inferTrainingAction(event: AgentEvent) {
  if (event.type === "nutrition_logged") return "log_nutrition";
  if (event.type === "nutrition_api_pending") return "request_nutrition_resolution";
  if (event.type === "food_library_updated") return "update_food_library";
  if (event.type === "preference_changed") return "update_preference";
  if (event.type === "agent_decision") return "agent_decision";
  if (event.type === "auth_completed") return "complete_auth";
  return "update_profile";
}

function inferAccepted(event: AgentEvent) {
  const source = event.source.toLowerCase();
  if (source.includes("từ chối") || source.includes("reject")) return false;
  if (source.includes("xác nhận") || source.includes("confirm") || source.includes("ghi vào nhật ký")) return true;
  if (event.type === "nutrition_logged" || event.type === "food_library_updated" || event.type === "preference_changed") return true;
  return null;
}

export function buildAgentTrainingSamples(events: AgentEvent[]): AgentTrainingSample[] {
  return events.map((event) => ({
    input: event.source,
    context: {
      eventType: event.type,
      profileEmail: event.profileEmail,
      source: event.source,
      payload: event.payload,
    },
    label: {
      accepted: inferAccepted(event),
      action: inferTrainingAction(event),
    },
    metadata: {
      eventId: event.id,
      createdAt: event.createdAt,
      schemaVersion: "magerlife.training.v1",
    },
  }));
}

export function serializeTrainingSamplesAsJsonl(samples: AgentTrainingSample[]) {
  return samples.map((sample) => JSON.stringify(sample)).join("\n");
}
