import type { ResolvedNutrition } from "./nutritionResolver";
import { callMagerLifeApi } from "./apiClient";
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
  const apiResult = await callMagerLifeApi(
    "POST /nutrition/resolve-food",
    {
      userId: "local-demo-user",
      text: request.text,
      meal: request.meal as "Sáng" | "Trưa" | "Tối" | "Phụ",
      profile: profile || undefined,
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
