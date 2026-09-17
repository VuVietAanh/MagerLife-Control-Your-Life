import type { AiProviderKey, AiSettings, UserProfile } from "../models/profile";
import type { AiOverride } from "./apiContracts";

export type { AiProviderKey, AiSettings };

export type AiProviderPreset = {
  key: AiProviderKey;
  label: string;
  needsApiKey: boolean;
  runsLocally: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  freeNote: string;
  guideUrl: string;
  guideSteps: string[];
};

// Thông tin hiển thị + giá trị mặc định cho từng provider trong màn Settings > Trợ lý AI.
export const AI_PROVIDER_PRESETS: Record<AiProviderKey, AiProviderPreset> = {
  mock: {
    key: "mock",
    label: "Không dùng AI (chỉ rule engine)",
    needsApiKey: false,
    runsLocally: false,
    defaultBaseUrl: "",
    defaultModel: "",
    freeNote: "Miễn phí, không cần cài gì thêm. Chat và gợi ý sẽ chỉ dùng rule cứng, không gọi model ngôn ngữ nào.",
    guideUrl: "",
    guideSteps: [],
  },
  ollama: {
    key: "ollama",
    label: "Ollama — chạy miễn phí ngay trên máy bạn",
    needsApiKey: false,
    runsLocally: true,
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3.1",
    freeNote: "Hoàn toàn miễn phí, không giới hạn số lần gọi. Cần máy đủ mạnh (RAM 8GB+) và phải mở Ollama trong lúc dùng app.",
    guideUrl: "https://ollama.com/download",
    guideSteps: [
      "Tải và cài Ollama tại ollama.com/download.",
      "Mở terminal/cmd, chạy: ollama pull llama3.1 (có thể đổi sang model nhẹ hơn nếu máy yếu, ví dụ llama3.2).",
      "Để Ollama chạy nền, quay lại đây bấm \"Kiểm tra kết nối\" để xác nhận.",
    ],
  },
  groq: {
    key: "groq",
    label: "Groq — nhanh, có hạn mức miễn phí mỗi ngày",
    needsApiKey: true,
    runsLocally: false,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    freeNote: "Groq cấp free khoảng vài nghìn token/ngày tuỳ model, đủ dùng cho cá nhân/vài người. Hết hạn mức thì đợi qua ngày hoặc đổi sang model nhẹ hơn.",
    guideUrl: "https://console.groq.com/keys",
    guideSteps: [
      "Vào console.groq.com và đăng ký tài khoản (miễn phí).",
      "Vào mục API Keys, bấm Create API Key.",
      "Copy key vừa tạo và dán vào ô API key bên dưới.",
    ],
  },
  openai: {
    key: "openai",
    label: "OpenAI (hoặc dịch vụ tương thích OpenAI khác)",
    needsApiKey: true,
    runsLocally: false,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    freeNote: "Cần tài khoản OpenAI có sẵn credit, không có hạn mức free hằng ngày như Groq. Cũng dùng được cho OpenRouter hoặc dịch vụ tương thích OpenAI khác nếu đổi Base URL.",
    guideUrl: "https://platform.openai.com/api-keys",
    guideSteps: [
      "Vào platform.openai.com/api-keys, tạo API key mới.",
      "Dán key vào ô bên dưới.",
      "Nếu dùng dịch vụ tương thích OpenAI khác (OpenRouter...), đổi Base URL cho đúng.",
    ],
  },
  xai: {
    key: "xai",
    label: "xAI / Grok",
    needsApiKey: true,
    runsLocally: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-2-latest",
    freeNote: "Cần tài khoản xAI có API key riêng, không có hạn mức free rõ ràng.",
    guideUrl: "https://console.x.ai",
    guideSteps: ["Vào console.x.ai, tạo API key.", "Dán key vào ô bên dưới."],
  },
};

export function isLocalAiProvider(provider?: AiProviderKey) {
  return provider === "ollama";
}

// Dùng trước khi gửi profile lên các API đồng bộ chung (saveProfileToApi, /profile/update...).
// API key AI chỉ nên nằm trên máy người dùng (localStorage/local profile); không được lọt vào
// dữ liệu profile đồng bộ lên server dùng chung, vì server đó có thể lưu profile vào DB chung.
export function sanitizeProfileForSync<TProfile extends { aiSettings?: AiSettings }>(profile: TProfile): TProfile {
  if (!profile.aiSettings?.apiKey) return profile;
  return {
    ...profile,
    aiSettings: { ...profile.aiSettings, apiKey: undefined },
  };
}

// Chuyển AiSettings (lưu trên máy user) thành AiOverride để gửi kèm request lên backend
// cho các provider chạy trên mây. Trả về undefined cho "mock"/"ollama" (Ollama luôn gọi trực tiếp từ client).
export function resolveAiOverride(aiSettings?: AiSettings): AiOverride | undefined {
  if (!aiSettings) return undefined;
  if (aiSettings.provider !== "groq" && aiSettings.provider !== "openai" && aiSettings.provider !== "xai") return undefined;
  if (!aiSettings.apiKey) return undefined;
  return {
    provider: aiSettings.provider,
    apiKey: aiSettings.apiKey,
    model: aiSettings.model || undefined,
    baseUrl: aiSettings.baseUrl || undefined,
  };
}

function resolveConnectionConfig(aiSettings: AiSettings) {
  const preset = AI_PROVIDER_PRESETS[aiSettings.provider];
  return {
    baseUrl: (aiSettings.baseUrl || preset.defaultBaseUrl).replace(/\/+$/, ""),
    apiKey: aiSettings.apiKey || "",
    model: aiSettings.model || preset.defaultModel,
  };
}

function safeJsonFromText(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        // fallthrough
      }
    }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export type AiConnectionTestResult = { ok: boolean; message: string };

// Bấm nút "Kiểm tra kết nối" ở Settings gọi hàm này. Chạy hoàn toàn từ trình duyệt/app,
// không qua backend, vì Ollama chỉ có thể gọi được từ đúng máy đang chạy nó.
export async function testAiConnection(aiSettings: AiSettings): Promise<AiConnectionTestResult> {
  if (aiSettings.provider === "mock") {
    return { ok: true, message: "Không dùng AI ngoài, chat/gợi ý sẽ chỉ chạy bằng rule local." };
  }
  const { baseUrl, apiKey } = resolveConnectionConfig(aiSettings);
  if (!baseUrl) return { ok: false, message: "Thiếu Base URL." };
  try {
    if (aiSettings.provider === "ollama") {
      const response = await fetch(`${baseUrl.replace(/\/v1$/, "")}/api/tags`);
      if (!response.ok) return { ok: false, message: `Ollama phản hồi lỗi ${response.status}. Kiểm tra Ollama đã bật chưa.` };
      return { ok: true, message: "Kết nối Ollama thành công." };
    }
    if (!apiKey) return { ok: false, message: "Thiếu API key." };
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return { ok: false, message: `Provider phản hồi lỗi ${response.status}. Kiểm tra lại API key hoặc Base URL.` };
    return { ok: true, message: "Kết nối thành công, API key hợp lệ." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Không kết nối được: ${error.message}` : "Không kết nối được tới provider.",
    };
  }
}

async function callChatCompletionsJson({
  baseUrl,
  apiKey,
  model,
  system,
  user,
  temperature = 0.2,
}: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
}): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI request failed: ${response.status} ${detail.slice(0, 240)}`);
  }
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = safeJsonFromText(content);
  if (!parsed) throw new Error("Provider trả về nội dung không phải JSON hợp lệ.");
  return parsed;
}

// Ba hàm dưới đây là bản port lại chính xác 3 prompt đang dùng ở server (src/server/llmProvider.mjs),
// để khi user chọn Ollama thì gọi thẳng từ máy họ (server trên Vercel không thể với tới Ollama chạy local).

export async function answerChatWithLocalAi({
  text,
  profile,
  clientContext,
  aiSettings,
}: {
  text: string;
  profile: UserProfile | null;
  clientContext: { currency?: string; activeTab?: string; localTime?: string };
  aiSettings: AiSettings;
}) {
  const { baseUrl, apiKey, model } = resolveConnectionConfig(aiSettings);
  const parsed = await callChatCompletionsJson({
    baseUrl,
    apiKey,
    model,
    temperature: 0.35,
    system:
      "Bạn là Chat Agent của MagerLife. Trả JSON thuần. Vai trò chính là cập nhật thông tin vào hệ thống và đưa kết luận dựa trên dữ liệu. Không giảng giải dài, không tự khuyên nếu user chỉ đang ghi nhận dữ liệu. Chỉ cảnh báo khi dữ liệu cho thấy vượt kcal, gần/vượt budget hoặc có xung đột rõ. Không chẩn đoán y tế.",
    user: JSON.stringify({
      task: "chat_turn",
      text,
      rules: [
        "If user asks for advice, profilePatch must be {}.",
        "Use foodMonthlyBudget and calorieNote if available.",
        "Give practical Vietnamese meal suggestions only when user asks what to eat.",
        "Do not suggest food that clearly exceeds provided meal/day budget.",
        "If budget is under 30000 VND, prefer home meal/egg/tofu/rice/vegetables; do not suggest pho/bun/com tam bought outside.",
        "Mention kcal direction only as recommendation, not medical certainty.",
        "Do not ask a vague follow-up unless required.",
      ],
      profileSummary: {
        currentPriority: profile?.currentPriority,
        goalSummary: profile?.goalSummary,
        budgetStyle: profile?.budgetStyle,
        calorieNote: profile?.calorieNote,
        foodMonthlyBudget: profile?.foodMonthlyBudget,
      },
      clientContext,
      outputShape: { message: "string", profilePatch: {}, pendingAction: null },
    }),
  });
  return {
    message: String(parsed.message || "Mình đã phân tích xong, nhưng cần bạn xác nhận trước khi cập nhật hệ thống."),
    profilePatch: parsed.profilePatch && typeof parsed.profilePatch === "object" ? (parsed.profilePatch as Partial<UserProfile>) : {},
    pendingAction: (parsed.pendingAction as { type: "resolve_food" | "confirm_profile_update" | "upgrade_required"; reason: string } | undefined) || undefined,
  };
}

export async function resolveFoodWithLocalAi({
  text,
  meal,
  profile,
  aiSettings,
}: {
  text: string;
  meal?: string;
  profile?: UserProfile | null;
  aiSettings: AiSettings;
}) {
  const { baseUrl, apiKey, model } = resolveConnectionConfig(aiSettings);
  const parsed = await callChatCompletionsJson({
    baseUrl,
    apiKey,
    model,
    system:
      "Bạn là Nutrition Resolver cho MagerLife. Trả về JSON thuần, không markdown. Nhiệm vụ là ước tính khẩu phần/kcal để user xác nhận, không đưa lời khuyên ăn ít hơn/nhiều hơn. Luôn giữ đúng tên món người dùng nhập, không dịch sai, không đổi sang món khác. Nếu user dùng đơn vị đời thường như quả/cái/bát/tô/phần/ly/hộp, hãy quy đổi sang gram/ml theo khẩu phần phổ biến tại Việt Nam và phản ánh trong tên candidate. Ước tính bảo thủ, cần user xác nhận.",
    user: JSON.stringify({
      task: "resolve_food",
      text,
      meal,
      rules: [
        "Preserve Vietnamese dish identity and dish name.",
        "Do not replace noodle soup dishes with steak or western dishes.",
        "If the text contains phở/bún/mì/cơm, include reasonable carbs.",
        "If the text contains count-based serving units, estimate total grams/ml; example: 4 quả trứng gà thường khoảng 150-220g edible portion depending egg size.",
        "Do not give diet advice in this endpoint; only return candidates.",
        "Return exactly one JSON object with status and candidates.",
        "source must be llm_estimate.",
      ],
      profile: {
        goalSummary: profile?.goalSummary,
        dietPreference: profile?.dietPreference,
        calorieNote: profile?.calorieNote,
        currency: profile?.currency,
      },
      outputShape: {
        status: "needs_confirmation",
        candidates: [{ name: "string", confidence: 0.6, kcal: 400, carbs: 45, protein: 25, fat: 12, fiber: 4, source: "llm_estimate" }],
      },
    }),
  });
  const candidates = Array.isArray(parsed.candidates) ? (parsed.candidates as Array<Record<string, unknown>>) : [];
  return {
    status: (candidates.length ? "needs_confirmation" : "not_found") as "needs_confirmation" | "not_found",
    candidates: candidates.slice(0, 3).map((candidate) => ({
      name: String(candidate.name || text).slice(0, 80),
      confidence: Math.max(0.1, Math.min(0.95, Number(candidate.confidence) || 0.55)),
      kcal: Math.max(1, Math.round(Number(candidate.kcal) || 0)),
      carbs: Math.max(0, Math.round(Number(candidate.carbs) || 0)),
      protein: Math.max(0, Math.round(Number(candidate.protein) || 0)),
      fat: Math.max(0, Math.round(Number(candidate.fat) || 0)),
      fiber: Math.max(0, Math.round(Number(candidate.fiber) || 0)),
      source: "llm_estimate" as const,
    })),
  };
}

export async function extractProfilePatchWithLocalAi({
  patch,
  sourceText,
  currentProfile,
  aiSettings,
}: {
  patch: Partial<UserProfile>;
  sourceText: string;
  currentProfile: Partial<UserProfile>;
  aiSettings: AiSettings;
}) {
  const { baseUrl, apiKey, model } = resolveConnectionConfig(aiSettings);
  const parsed = await callChatCompletionsJson({
    baseUrl,
    apiKey,
    model,
    system:
      "Bạn là Profile Extraction Agent của MagerLife. Chỉ trích xuất thông tin user tự nói rõ. Không bịa. Trả JSON thuần. Chỉ dùng các field được cho phép. Nếu không chắc thì bỏ qua và thêm warning.",
    user: JSON.stringify({
      task: "profile_update",
      sourceText,
      existingPatch: patch || {},
      allowedPatchFields: [
        "name",
        "birthday",
        "gender",
        "weight",
        "height",
        "salary",
        "foodMonthlyBudget",
        "currentPriority",
        "goalSummary",
        "dietPreference",
        "trainingHabit",
        "lifestyle",
        "budgetStyle",
        "supportStyle",
        "interests",
        "customChoiceSummary",
      ],
      rules: [
        "weight and height must be strings when extracted.",
        "salary and foodMonthlyBudget must be numbers when extracted.",
        "Do not overwrite birthday or gender unless user explicitly states them.",
        "For goals, keep concise Vietnamese text in goalSummary.",
        "Return { patch: {}, warnings: [] } if no durable profile data is present.",
      ],
      currentProfile: {
        birthday: currentProfile?.birthday,
        gender: currentProfile?.gender,
        weight: currentProfile?.weight,
        height: currentProfile?.height,
        currentPriority: currentProfile?.currentPriority,
        goalSummary: currentProfile?.goalSummary,
      },
      outputShape: { patch: {}, warnings: [] },
    }),
  });
  return {
    patch: (parsed.patch && typeof parsed.patch === "object" ? parsed.patch : {}) as Partial<UserProfile>,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
  };
}
