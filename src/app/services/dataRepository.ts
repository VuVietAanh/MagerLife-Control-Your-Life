import type { AgentEvent } from "./agentEventService";
import type { AgentTrainingRecord } from "../models/storageSchema";

const TRAINING_RECORD_STORAGE_KEY = "magerlife.agent.training.records.v1";

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
