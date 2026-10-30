import { Bot, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { type AiProviderKey, type AiSettings, type UserProfile } from "../../models/profile";
import { AI_PROVIDER_PRESETS, testAiConnection } from "../../services/aiProviderService";
import { Glass, Mono } from "../../ui/primitives";

export function AiSettingsCard({
  profile,
  onProfileUpdate,
}: {
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const savedSettings = profile?.aiSettings;
  const [draft, setDraft] = useState<AiSettings>({
    provider: savedSettings?.provider || "mock",
    apiKey: savedSettings?.apiKey || "",
    model: savedSettings?.model || "",
    baseUrl: savedSettings?.baseUrl || "",
  });
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [savedText, setSavedText] = useState("");

  useEffect(() => {
    setDraft({
      provider: savedSettings?.provider || "mock",
      apiKey: savedSettings?.apiKey || "",
      model: savedSettings?.model || "",
      baseUrl: savedSettings?.baseUrl || "",
    });
    setTestStatus("idle");
    setTestMessage("");
  }, [profile?.email]);

  const preset = AI_PROVIDER_PRESETS[draft.provider];

  function patchDraft(key: "apiKey" | "model" | "baseUrl", value: string) {
    setTestStatus("idle");
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function selectProvider(nextProvider: AiProviderKey) {
    setTestStatus("idle");
    setDraft({ provider: nextProvider, apiKey: "", model: "", baseUrl: "" });
  }

  async function handleTestConnection() {
    setTestStatus("testing");
    setTestMessage("");
    const result = await testAiConnection(draft);
    setTestStatus(result.ok ? "ok" : "error");
    setTestMessage(result.message);
  }

  function saveAiSettings() {
    onProfileUpdate(
      {
        aiSettings: {
          provider: draft.provider,
          apiKey: draft.apiKey?.trim() || undefined,
          model: draft.model?.trim() || undefined,
          baseUrl: draft.baseUrl?.trim() || undefined,
        },
      },
      `Người dùng cập nhật cấu hình Trợ lý AI (provider=${draft.provider}).`
    );
    setSavedText("Đã lưu cấu hình AI. Key chỉ được lưu trên máy này, không gửi lên kho dữ liệu dùng chung.");
  }

  return (
    <Glass className="p-5">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <Mono className="text-emerald-700">AI Settings</Mono>
          <h2 className="mt-1 text-xl font-black text-slate-900">Trợ lý AI</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Chọn model xử lý chat/gợi ý món ăn. Key API được lưu riêng trên máy bạn, không đưa vào kho dữ liệu dùng chung với người khác.
          </p>
        </div>
        <Bot className="h-5 w-5 text-emerald-500" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        {(Object.keys(AI_PROVIDER_PRESETS) as AiProviderKey[]).map((key) => {
          const option = AI_PROVIDER_PRESETS[key];
          const active = draft.provider === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectProvider(key)}
              className={`text-left rounded-2xl border p-3 transition ${
                active ? "border-emerald-400 bg-emerald-50/70 ring-2 ring-emerald-200" : "border-slate-200 bg-white hover:border-emerald-200"
              }`}
            >
              <p className="text-sm font-black text-slate-900">{option.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{option.freeNote}</p>
            </button>
          );
        })}
      </div>

      {preset.guideSteps.length > 0 && (
        <div className="mb-4 rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-sky-700">Cách lấy / cài đặt</p>
          <ol className="mt-2 space-y-1 text-sm text-slate-700 list-decimal list-inside">
            {preset.guideSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {preset.guideUrl && (
            <a href={preset.guideUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-sky-700 underline">
              {preset.guideUrl}
            </a>
          )}
        </div>
      )}

      {draft.provider !== "mock" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {preset.needsApiKey && (
            <label className="space-y-1.5 md:col-span-2">
              <span className="text-xs font-bold text-slate-500">API key</span>
              <div className="flex gap-2">
                <input
                  type={showKey ? "text" : "password"}
                  value={draft.apiKey || ""}
                  onChange={(event) => patchDraft("apiKey", event.target.value)}
                  placeholder="Dán API key của bạn vào đây"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50"
                >
                  {showKey ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Model</span>
            <input
              value={draft.model || ""}
              onChange={(event) => patchDraft("model", event.target.value)}
              placeholder={preset.defaultModel}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Base URL (nâng cao)</span>
            <input
              value={draft.baseUrl || ""}
              onChange={(event) => patchDraft("baseUrl", event.target.value)}
              placeholder={preset.defaultBaseUrl}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400"
            />
          </label>
        </div>
      )}

      {testMessage && (
        <p className={`mt-4 rounded-xl border px-3 py-2 text-sm font-bold ${testStatus === "ok" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
          {testMessage}
        </p>
      )}
      {savedText && <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{savedText}</p>}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {draft.provider !== "mock" && (
          <button
            onClick={handleTestConnection}
            disabled={testStatus === "testing"}
            className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {testStatus === "testing" ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
          </button>
        )}
        <button onClick={saveAiSettings} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800">
          Lưu cấu hình AI
        </button>
      </div>
    </Glass>
  );
}
