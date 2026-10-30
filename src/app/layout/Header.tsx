import { Bot, Brain, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { type UserProfile } from "../models/profile";
import { getApiHealth } from "../services/magerLifeApiFacade";
import { type Tab, getNavigationTabs } from "./navigation";
import { Mono } from "../ui/primitives";

export function Header({ tab, setTab, profile, onLogout }: { tab: Tab; setTab: (tab: Tab) => void; profile: UserProfile | null; onLogout: () => void }) {
  const [apiHealth, setApiHealth] = useState<{
    status: "checking" | "online" | "offline";
    label: string;
  }>({ status: "checking", label: "API..." });
  const tabs = getNavigationTabs(profile);

  async function refreshApiHealth() {
    setApiHealth((prev) => ({ ...prev, status: "checking", label: "API..." }));
    const result = await getApiHealth();
    if (result.ok && result.data?.ok) {
      setApiHealth({
        status: "online",
        label: result.data.llmConfigured ? `${result.data.provider} · ${result.data.model || "model"}` : "API mock",
      });
      return;
    }
    setApiHealth({ status: "offline", label: "API offline" });
  }

  useEffect(() => {
    void refreshApiHealth();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/70 bg-white/50 backdrop-blur-2xl">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-300/70">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-slate-900 leading-none">MagerLife</div>
            <Mono className="text-emerald-700">AI Life Agent System</Mono>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((item) => {
            const active = item.id === tab;
            const displayLabel = item.id === "food-admin" && profile?.role === "admin" ? "Kho Admin" : item.label;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {displayLabel}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void refreshApiHealth()}
          className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-black transition ${
            apiHealth.status === "online"
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : apiHealth.status === "offline"
                ? "border-rose-100 bg-rose-50 text-rose-700"
                : "border-slate-100 bg-white/70 text-slate-500"
          }`}
          title="Kiểm tra API server"
        >
          <span className={`h-2 w-2 rounded-full ${apiHealth.status === "online" ? "bg-emerald-500" : apiHealth.status === "offline" ? "bg-rose-500" : "bg-amber-400"}`} />
          <Bot className="h-3.5 w-3.5" />
          {apiHealth.label}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 text-xs font-black text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          title="Đăng xuất"
        >
          <LogOut className="h-3.5 w-3.5" />
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
