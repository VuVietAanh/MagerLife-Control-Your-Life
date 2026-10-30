import React from "react";
import { Brain, Check, Shield, X } from "lucide-react";
import { useState } from "react";
import { type Memory } from "../../models/agent";
import { type AgentEvent } from "../../services/agentEventService";
import { buildAgentTrainingSamples, serializeTrainingSamplesAsJsonl } from "../../services/trainingDatasetService";
import { syncAgentEventsToApi } from "../../services/magerLifeApiFacade";
import { Glass, Mono, Progress } from "../../ui/primitives";

export function BrainView({
  memories,
  setMemories,
  agentEvents,
}: {
  memories: Memory[];
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
  agentEvents: AgentEvent[];
}) {
  const shownAgentEvents = agentEvents.slice(-8).reverse();
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");

  function exportAgentEvents() {
    const blob = new Blob([JSON.stringify(agentEvents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `magerlife-agent-events-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTrainingJsonl() {
    const samples = buildAgentTrainingSamples(agentEvents);
    const blob = new Blob([serializeTrainingSamplesAsJsonl(samples)], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `magerlife-training-samples-${new Date().toISOString().slice(0, 10)}.jsonl`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function syncAgentEvents() {
    if (!agentEvents.length || syncStatus === "syncing") return;
    setSyncStatus("syncing");
    setSyncMessage("Đang gửi event log lên mock API...");
    const profileEmail = [...agentEvents].reverse().find((event) => event.profileEmail)?.profileEmail;
    const eventsToSync = agentEvents.slice(-100);
    const result = await syncAgentEventsToApi({
      userId: profileEmail || "local-demo-user",
      events: eventsToSync,
    });
    if (result.ok) {
      setSyncStatus("success");
      setSyncMessage(`Đã sync ${result.data?.accepted || 0} event. Backend mock đã nhận dữ liệu.`);
      return;
    }
    setSyncStatus("error");
    setSyncMessage(result.error?.message || "Không sync được event log. Hãy bật npm run api:mock rồi thử lại.");
  }

  function removeMemory(id: string) {
    setMemories((prev) => prev.filter((memory) => memory.id !== id));
  }

  function confirmMemory(id: string) {
    setMemories((prev) => prev.map((memory) => memory.id === id ? { ...memory, confidence: 0.99, source: "user_input", lastVerified: "2026-05-31" } : memory));
  }

  return (
    <main className="p-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-3">
        <Glass className="p-4">
          <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center mb-4">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <Mono className="text-emerald-700">Privacy Hub</Mono>
          <h1 className="text-lg font-bold text-slate-900 mb-3">My Brain</h1>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Memories</span>
              <span className="text-sm font-bold text-slate-900">{memories.length}</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Avg confidence</span>
              <span className="text-sm font-bold text-slate-900">
                {Math.round((memories.reduce((sum, item) => sum + item.confidence, 0) / memories.length) * 100)}%
              </span>
            </div>
          </div>
        </Glass>

        <Glass className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Mono className="text-sky-700">Training Data</Mono>
              <h2 className="mt-1 text-sm font-black text-slate-900">Agent event log</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={exportAgentEvents}
                disabled={!agentEvents.length}
                className="rounded-lg border border-sky-100 bg-white px-2.5 py-1.5 text-[11px] font-black text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={exportTrainingJsonl}
                disabled={!agentEvents.length}
                className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                JSONL
              </button>
              <button
                type="button"
                onClick={() => void syncAgentEvents()}
                disabled={!agentEvents.length || syncStatus === "syncing"}
                className="rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1.5 text-[11px] font-black text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {syncStatus === "syncing" ? "Sync..." : "Sync API"}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Các sự kiện gần nhất để sau này lọc, gắn nhãn và huấn luyện lại Agent.</p>
          {syncMessage && (
            <p
              className={`mt-2 rounded-xl border px-3 py-2 text-xs font-bold leading-relaxed ${
                syncStatus === "success"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                  : syncStatus === "error"
                    ? "border-rose-100 bg-rose-50 text-rose-700"
                    : "border-violet-100 bg-violet-50 text-violet-700"
              }`}
            >
              {syncMessage}
            </p>
          )}
          <div className="mt-3 space-y-2">
            {shownAgentEvents.length ? shownAgentEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-100 bg-white/75 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">{event.type}</span>
                  <span className="text-[10px] font-mono text-slate-400">{new Date(event.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-600">{event.source}</p>
              </div>
            )) : (
              <div className="rounded-xl border border-slate-100 bg-white/70 p-3 text-xs font-semibold leading-relaxed text-slate-500">
                Chưa có event. Hãy chat, cập nhật profile hoặc ghi món ăn để hệ thống bắt đầu thu thập dữ liệu.
              </div>
            )}
          </div>
        </Glass>
      </div>

      <div className="space-y-3">
        {memories.map((memory) => (
          <Glass key={memory.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">{memory.category}</span>
                  <Mono className="text-slate-400">{memory.source}</Mono>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed">{memory.content}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => confirmMemory(memory.id)} className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Confirm
                </button>
                <button onClick={() => removeMemory(memory.id)} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_80px] gap-3 items-center">
              <Progress value={memory.confidence * 100} tone={memory.confidence > 0.8 ? "bg-emerald-500" : "bg-amber-400"} />
              <span className="text-xs text-right font-mono text-slate-500">{Math.round(memory.confidence * 100)}%</span>
            </div>
          </Glass>
        ))}
      </div>
    </main>
  );
}
