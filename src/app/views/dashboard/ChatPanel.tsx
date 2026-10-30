import { Brain, Lock, Send } from "lucide-react";
import { useState } from "react";
import { type Message } from "../../models/agent";
import { type Jar, type MoneyCurrency } from "../../models/finance";
import { type NutritionMealLog } from "../../models/nutrition";
import { type UserProfile } from "../../models/profile";
import { answerChatWithLocalAi, isLocalAiProvider, resolveAiOverride } from "../../services/aiProviderService";
import { resolveChatAgentTurn } from "../../services/chatAgentService";
import { type FoodLibraryItem } from "../../services/foodLibraryService";
import { resolveNutritionByApiContract } from "../../services/nutritionApiService";
import { sendChatTurnToApi } from "../../services/magerLifeApiFacade";
import { money } from "../../lib/format";
import { Glass, Mono } from "../../ui/primitives";
import { detectMealFromText, looksLikeFoodLog, parseNutritionMealFromChat } from "../../lib/nutritionText";

const quickQuestions = [
  "Hôm nay tôi có nên ăn phở không?",
  "Tối nay nên tập gì nếu ngủ 6 tiếng?",
  "Tôi có nên mua khóa học 1.2 triệu không?",
];

export function ChatPanel({
  jars,
  profile,
  currency,
  adminFoodLibrary,
  onProfileUpdate,
}: {
  jars: Jar[];
  profile: UserProfile | null;
  currency: MoneyCurrency;
  adminFoodLibrary: FoodLibraryItem[];
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Mình là MagerLife. Hôm nay mình đang theo dõi tài chính, sức khỏe và lịch của bạn." },
  ]);
  const [input, setInput] = useState("");

  async function send(text = input) {
    if (!text.trim()) return;
    const result = resolveChatAgentTurn<UserProfile, NutritionMealLog>({
      text,
      jars,
      profile,
      resolveMealLog: (message) => parseNutritionMealFromChat(message, profile, adminFoodLibrary),
      looksLikeFoodLog,
      detectMealFromText,
      moneyFormatter: money,
    });
    let finalText = result.aiText;
    let finalPatch = result.profilePatch;
    let finalSourceText = result.profileSourceText || text;
    const pendingRequests = finalPatch?.pendingNutritionApiRequests || [];
    const latestPendingRequest = pendingRequests[pendingRequests.length - 1];
    if (latestPendingRequest) {
      try {
        const resolution = await resolveNutritionByApiContract(latestPendingRequest, profile);
        const firstSuggestion = resolution.suggestions[0];
        if (firstSuggestion) {
          finalText = [
            `Mình đã đưa khẩu phần này qua API/LLM để ước tính.`,
            `Gợi ý gần nhất: ${firstSuggestion.name} - khoảng ${firstSuggestion.kcal} kcal.`,
            "Mình chưa ghi vào nhật ký; hãy xác nhận candidate ở phần Calo & Dinh dưỡng nếu đúng.",
          ].join(" ");
        }
      } catch {
        finalText = `${finalText} API/LLM hiện chưa phản hồi được, request vẫn nằm trong hàng chờ xác nhận.`;
      }
    }
    const shouldTryApi = !result.profilePatch && result.aiText.includes("sau đó mới gọi LLM");
    if (shouldTryApi) {
      const aiSettings = profile?.aiSettings;
      try {
        if (aiSettings && isLocalAiProvider(aiSettings.provider)) {
          const local = await answerChatWithLocalAi({
            text,
            profile,
            clientContext: { currency, activeTab: "dashboard", localTime: new Date().toISOString() },
            aiSettings,
          });
          finalText = local.message;
          finalPatch = local.profilePatch as Partial<UserProfile> | undefined;
          finalSourceText = `Chat API/LLM (Ollama local): ${text}`;
        } else {
          const apiResult = await sendChatTurnToApi({
            text,
            profile,
            currency,
            aiOverride: resolveAiOverride(aiSettings),
          });
          if (apiResult.ok && apiResult.data?.message) {
            finalText = apiResult.data.message;
            finalPatch = apiResult.data.profilePatch as Partial<UserProfile> | undefined;
            finalSourceText = `Chat API/LLM: ${text}`;
          }
        }
      } catch {
        // giữ nguyên finalText từ rule local nếu gọi AI lỗi.
      }
    }
    if (finalPatch && Object.keys(finalPatch).length > 0) {
      onProfileUpdate(finalPatch, finalSourceText);
    }
    setMessages((prev) => [...prev, { role: "user", text }, { role: "ai", text: finalText }]);
    setInput("");
  }

  return (
    <Glass className="h-[520px] flex flex-col">
      <div className="p-4 border-b border-white/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">MagerLife Chat</p>
            <Mono className="text-slate-400">context-aware</Mono>
          </div>
        </div>
        <Lock className="h-4 w-4 text-slate-400" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[86%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                message.role === "user" ? "bg-slate-900 text-white" : "bg-white/75 text-slate-700 border border-white/80"
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
        {quickQuestions.map((question) => (
          <button key={question} onClick={() => send(question)} className="shrink-0 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-white">
            {question}
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-white/70 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send()}
          placeholder="Hỏi về quyết định hôm nay..."
          className="min-w-0 flex-1 rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs outline-none focus:border-emerald-400"
        />
        <button onClick={() => send()} className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </Glass>
  );
}
