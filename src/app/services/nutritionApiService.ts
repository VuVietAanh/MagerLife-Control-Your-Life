import type { ResolvedNutrition } from "./nutritionResolver";
import { callMagerLifeApi } from "./apiClient";
import { isLocalAiProvider, resolveAiOverride, resolveFoodWithLocalAi } from "./aiProviderService";
import type { UserProfile } from "../models/profile";

export type NutritionApiStatus = "pending" | "resolved" | "rejected";

export type NutritionApiRequest = {
  id: string;
  text: string;
  meal: string;
  status: NutritionApiStatus;
  createdAt: string;
};

export type PendingNutritionApiRequest = NutritionApiRequest;

export type NutritionApiSuggestion = ResolvedNutrition & {
  confidence: number;
  source: "llm_estimate" | "external_food_api" | "external_api" | "admin_review";
  note: string;
};

export type NutritionApiResolution = {
  requestId: string;
  suggestions: NutritionApiSuggestion[];
  needsUserConfirmation: boolean;
};

export function createPendingNutritionApiRequest(text: string, meal: string): NutritionApiRequest {
  return {
    id: `${Date.now()}-nutrition-api`,
    text: text.trim(),
    meal,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

export async function resolveNutritionByApiContract(request: NutritionApiRequest, profile?: UserProfile | null): Promise<NutritionApiResolution> {
  const aiSettings = profile?.aiSettings;

  // Ollama chạy trên máy chính chủ, backend chung (Vercel...) không thể gọi tới máy đó,
  // nên khi provider là Ollama thì gọi thẳng từ đây thay vì đi qua /nutrition/resolve-food.
  if (aiSettings && isLocalAiProvider(aiSettings.provider)) {
    try {
      const localResult = await resolveFoodWithLocalAi({
        text: request.text,
        meal: request.meal,
        profile,
        aiSettings,
      });
      if (localResult.candidates.length) {
        return {
          requestId: request.id,
          suggestions: localResult.candidates.map((candidate) => ({
            name: candidate.name,
            kcal: candidate.kcal,
            carbs: candidate.carbs,
            protein: candidate.protein,
            fat: candidate.fat,
            fiber: candidate.fiber,
            confidence: candidate.confidence,
            source: "llm_estimate",
            note: "Ollama (local) estimate. Cần user xác nhận trước khi ghi nhật ký.",
          })),
          needsUserConfirmation: true,
        };
      }
    } catch {
      // rơi xuống fallback mock bên dưới nếu Ollama không gọi được.
    }
  }

  const apiResult = aiSettings && isLocalAiProvider(aiSettings.provider)
    ? ({ ok: false, data: undefined } as const)
    : await callMagerLifeApi(
        "POST /nutrition/resolve-food",
        {
          userId: "local-demo-user",
          text: request.text,
          meal: request.meal as "Sáng" | "Trưa" | "Tối" | "Phụ",
          profile: profile || undefined,
          aiOverride: resolveAiOverride(aiSettings),
        }
      );
  if (apiResult.ok && apiResult.data?.candidates?.length) {
    return {
      requestId: request.id,
      suggestions: apiResult.data.candidates.slice(0, 3).map((candidate) => ({
        name: candidate.name,
        kcal: candidate.kcal,
        carbs: candidate.carbs,
        protein: candidate.protein,
        fat: candidate.fat,
        fiber: candidate.fiber,
        confidence: candidate.confidence,
        source: candidate.source === "llm_estimate" ? "llm_estimate" : candidate.source === "external_api" ? "external_api" : "external_food_api",
        note: candidate.source === "llm_estimate" ? "API/LLM estimate. Cần user xác nhận trước khi ghi nhật ký." : "API candidate. Cần user xác nhận trước khi ghi nhật ký.",
      })),
      needsUserConfirmation: true,
    };
  }

  const normalized = request.text.toLowerCase();
  const isSnack = normalized.includes("snack") || normalized.includes("phụ") || normalized.includes("chuối") || normalized.includes("sữa");
  const isHeavyMeal = normalized.includes("cơm") || normalized.includes("phở") || normalized.includes("bún") || normalized.includes("mì");
  const kcal = isSnack ? 220 : isHeavyMeal ? 560 : 420;
  const name = request.text
    .replace(/\b(ăn|uong|uống|bữa|sáng|trưa|tối|phụ|breakfast|lunch|dinner|snack)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Món API ước tính";

  return {
    requestId: request.id,
    suggestions: [
      {
        name,
        kcal,
        carbs: Math.round((kcal * 0.48) / 4),
        protein: Math.round((kcal * 0.22) / 4),
        fat: Math.round((kcal * 0.25) / 9),
        fiber: Math.round(kcal / 140),
        confidence: 0.58,
        source: "llm_estimate",
        note: "Mock API/LLM estimate. Cần user xác nhận trước khi ghi nhật ký.",
      },
    ],
    needsUserConfirmation: true,
  };
}
