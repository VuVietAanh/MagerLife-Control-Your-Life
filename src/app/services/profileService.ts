import type { NutritionApiRequest } from "./nutritionApiService";

export type ProfileSignalValue = number | string | boolean;
export type ProfileSignals = Record<string, ProfileSignalValue>;

export type ProfileMergeBase = {
  email: string;
  birthday: string;
  gender: string;
  weight?: string;
  height?: string;
  salary?: number;
  foodMonthlyBudget?: number;
  healthGoal?: "gain" | "maintain" | "lose";
  subscriptionPlan?: "free" | "pro";
  role?: "user" | "admin";
  customChoiceInputs?: Record<string, string>;
  customChoiceSummary?: string;
  extractedSignals?: ProfileSignals;
  mealPlanSlots?: Array<{
    id: string;
    name: string;
    share: number;
    action: string;
  }>;
  pendingNutritionApiRequests?: NutritionApiRequest[];
  setupComplete?: boolean;
};

export function profileSignalChips(signals?: ProfileSignals) {
  if (!signals) return [];
  const signalLabels: Array<[string, string]> = [
    ["custom_time_pressure", "Ít thời gian / bận"],
    ["custom_sleep_risk", "Giấc ngủ cần theo dõi"],
    ["custom_stress_risk", "Có dấu hiệu stress"],
    ["custom_injury_risk", "Có rủi ro chấn thương"],
    ["custom_vegetarian_preference", "Có xu hướng ăn chay"],
    ["custom_food_allergy", "Có hạn chế thực phẩm"],
    ["custom_budget_pressure", "Nhạy cảm ngân sách"],
    ["custom_high_protein", "Ưu tiên protein"],
    ["custom_weight_loss", "Hướng giảm cân/giảm mỡ"],
    ["custom_weight_gain", "Hướng tăng cân/bulking"],
    ["custom_muscle_gain", "Hướng tăng cơ"],
  ];
  return signalLabels
    .filter(([key]) => Number(signals[key] || 0) > 0)
    .map(([key, label]) => ({ key, label }));
}

export function extractSignalsFromFreeText(text: string) {
  const normalized = text.toLowerCase();
  const hasAny = (keywords: string[]) => keywords.some((keyword) => normalized.includes(keyword));
  const hasPattern = (pattern: RegExp) => pattern.test(normalized);
  return {
    custom_time_pressure: hasAny(["bận", "deadline", "ca đêm", "tăng ca", "ít thời gian", "không có thời gian"]) ? 1 : 0,
    custom_sleep_risk: hasAny(["mất ngủ", "khó ngủ", "ngủ kém", "ngủ chập chờn", "thức khuya", "thiếu ngủ"]) ? 1 : 0,
    custom_stress_risk: hasAny(["stress", "căng thẳng", "áp lực", "lo âu", "mệt mỏi"]) ? 1 : 0,
    custom_injury_risk: hasAny(["đau", "chấn thương", "thoát vị", "đầu gối", "đau gối", "đau lưng", "đau vai"]) ? 1 : 0,
    custom_vegetarian_preference: hasAny(["ăn chay", "chay", "thuần chay", "mùng 1", "mùng một", "ngày rằm", "15 âm"]) ? 1 : 0,
    custom_food_allergy: hasAny(["dị ứng", "không ăn", "kiêng", "khó tiêu", "đau bụng"]) ? 1 : 0,
    custom_budget_pressure: hasAny(["tiết kiệm", "ít tiền", "hạn chế tiền", "ngân sách thấp", "rẻ", "không vượt"]) ? 1 : 0,
    custom_high_protein: hasAny(["protein", "đạm", "tăng cơ", "gym", "whey"]) ? 1 : 0,
    custom_weight_loss: hasAny(["giảm cân", "giảm mỡ", "cutting", "siết"]) ? 1 : 0,
    custom_weight_gain: hasPattern(/\b(tăng\s*cân|bulking)\b/) ? 1 : 0,
    custom_muscle_gain: hasAny(["tăng cơ", "tăng khối cơ", "tăng nạc", "muscle gain"]) ? 1 : 0,
    custom_raw_text: normalized,
  };
}

export function mergeExtractedSignals(current: ProfileSignals | undefined, next: ProfileSignals) {
  const merged = { ...(current || {}) };
  for (const [key, value] of Object.entries(next)) {
    if (key === "custom_raw_text") {
      const previous = String(merged.custom_raw_text || "").trim();
      const incoming = String(value || "").trim();
      merged.custom_raw_text = [previous, incoming].filter(Boolean).join(" | ");
    } else {
      merged[key] = Math.max(Number(merged[key] || 0), Number(value || 0));
    }
  }
  return merged;
}

export function parseVietnameseMoneyFromText(text: string, keywords: string[]) {
  const normalized = text.toLowerCase().replace(/\s+/g, " ");
  for (const keyword of keywords) {
    const pattern = new RegExp(`${keyword}[^\\d]*(\\d[\\d.,]*)\\s*(tỷ|ty|triệu|tr|k|nghìn|ngàn|usd|đô|đồng|vnd)?`, "i");
    const match = normalized.match(pattern);
    if (!match) continue;
    const rawNumber = match[1].replace(/\./g, "").replace(",", ".");
    const unit = match[2] || "";
    const numericValue = Number(rawNumber);
    if (!Number.isFinite(numericValue) || numericValue <= 0) continue;
    if (unit.includes("tỷ") || unit.includes("ty")) return Math.round(numericValue * 1_000_000_000);
    if (unit.includes("triệu") || unit === "tr") return Math.round(numericValue * 1_000_000);
    if (unit.includes("ngh") || unit.includes("ngàn") || unit === "k") return Math.round(numericValue * 1_000);
    return Math.round(numericValue);
  }
  return 0;
}

export function parseProfilePatchFromText<TProfile extends ProfileMergeBase>(text: string, profile: TProfile | null) {
  const normalized = text.toLowerCase();
  const patch: Partial<TProfile> = {};
  const monthlyIncome = parseVietnameseMoneyFromText(normalized, ["lương", "thu nhập", "income"]);
  const foodBudget = parseVietnameseMoneyFromText(normalized, ["ăn uống", "tiền ăn", "ngân sách ăn", "food"]);
  const weightMatch = normalized.match(/(\d{2,3}(?:[.,]\d+)?)\s*(kg|ký|kilogram)/);
  const heightMatch = normalized.match(/(\d{2,3}(?:[.,]\d+)?)\s*(cm|centimet)/);
  if (monthlyIncome > 0) patch.salary = monthlyIncome as TProfile["salary"];
  if (foodBudget > 0) patch.foodMonthlyBudget = foodBudget as TProfile["foodMonthlyBudget"];
  if (weightMatch) patch.weight = weightMatch[1].replace(",", ".") as TProfile["weight"];
  if (heightMatch) patch.height = heightMatch[1].replace(",", ".") as TProfile["height"];
  if (normalized.includes("giảm mỡ") || normalized.includes("giảm cân")) patch.healthGoal = "lose" as TProfile["healthGoal"];
  if (normalized.includes("tăng cân") || normalized.includes("bulking")) patch.healthGoal = "gain" as TProfile["healthGoal"];
  if (normalized.includes("giữ cân") || normalized.includes("duy trì cân")) patch.healthGoal = "maintain" as TProfile["healthGoal"];

  const nextSignals = extractSignalsFromFreeText(text);
  const nextSummary = [profile?.customChoiceSummary, text.trim()].filter(Boolean).join(" | ");
  patch.customChoiceSummary = nextSummary as TProfile["customChoiceSummary"];
  patch.extractedSignals = mergeExtractedSignals(profile?.extractedSignals, nextSignals) as TProfile["extractedSignals"];
  patch.customChoiceInputs = {
    ...(profile?.customChoiceInputs || {}),
    conversation: nextSummary,
  } as TProfile["customChoiceInputs"];
  return patch;
}

export function buildNextUserProfile<TProfile extends ProfileMergeBase>(
  baseProfile: TProfile,
  patch: Partial<TProfile>,
  sourceText: string
) {
  return {
    ...baseProfile,
    ...patch,
    subscriptionPlan: patch.subscriptionPlan || baseProfile.subscriptionPlan || "free",
    role: patch.role || baseProfile.role || "user",
    customChoiceInputs: {
      ...(baseProfile.customChoiceInputs || {}),
      ...(patch.customChoiceInputs || {}),
    },
    extractedSignals: mergeExtractedSignals(baseProfile.extractedSignals, patch.extractedSignals || {}),
    customChoiceSummary: patch.customChoiceSummary || [baseProfile.customChoiceSummary, sourceText].filter(Boolean).join(" | "),
    setupComplete: true,
  } as TProfile;
}
