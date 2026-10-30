import { type NutritionMealLog } from "../models/nutrition";
import { type UserProfile } from "../models/profile";
import { type FoodLibraryItem } from "../services/foodLibraryService";
import { FOOD_SERVING_UNITS, hasEverydayServingUnit, hasExplicitNutritionUnit, normalizeFoodServingUnit as serviceNormalizeFoodServingUnit, resolveNutritionFromFoodLibrary, type FoodServingUnit } from "../services/nutritionResolver";

export const foodServingUnits = FOOD_SERVING_UNITS;

function parseDecimalNumber(value: string) {
  return Number(value.replace(",", "."));
}

export function normalizeFoodServingUnit(unit?: string): FoodServingUnit {
  return serviceNormalizeFoodServingUnit(unit);
}

export function detectMealFromText(text: string): NutritionMealLog["meal"] {
  const normalized = text.toLowerCase();
  if (normalized.includes("sáng") || normalized.includes("sang") || normalized.includes("breakfast")) return "Sáng";
  if (normalized.includes("tối") || normalized.includes("toi") || normalized.includes("dinner")) return "Tối";
  if (normalized.includes("phụ") || normalized.includes("phu") || normalized.includes("snack")) return "Phụ";
  return "Trưa";
}

function extractMacroGram(text: string, keywords: string[]) {
  const escaped = keywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const afterNumber = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:g|gram)?\\s*(?:${escaped.join("|")})`, "i");
  const beforeNumber = new RegExp(`(?:${escaped.join("|")})\\D{0,12}(\\d+(?:[.,]\\d+)?)\\s*(?:g|gram)?`, "i");
  const match = text.match(afterNumber) || text.match(beforeNumber);
  return match?.[1] ? Math.round(parseDecimalNumber(match[1])) : undefined;
}

function extractMealPrice(text: string) {
  const normalized = text.toLowerCase();
  const match = normalized.match(/(?:giá|hết|mất|tốn|tiền)?\s*(\d[\d.,]*)\s*(k|nghìn|ngàn|đ|vnd|vnđ|đồng)\b/i);
  if (!match?.[1]) return undefined;
  const raw = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  const unit = match[2] || "";
  if (unit === "k" || unit.includes("ngh")) return Math.round(raw * 1000);
  return Math.round(raw);
}

function estimateNutritionFromFoodLibrary(text: string, profile: UserProfile | null, adminFoodLibrary: FoodLibraryItem[]) {
  if (hasEverydayServingUnit(text) && !hasExplicitNutritionUnit(text)) return null;
  return resolveNutritionFromFoodLibrary(text, [...(profile?.customFoodItems || []), ...adminFoodLibrary]);
}

export function looksLikeFoodLog(text: string) {
  const normalized = text.toLowerCase();
  return /(ăn|uong|uống|bữa|sáng|trưa|tối|phụ|breakfast|lunch|dinner|snack|món|khẩu phần|suất)/i.test(normalized);
}

export function parseNutritionMealFromChat(text: string, profile: UserProfile | null, adminFoodLibrary: FoodLibraryItem[]): NutritionMealLog | null {
  const kcalMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calo|calories|cal)\b/i);
  const estimated = kcalMatch?.[1] ? null : estimateNutritionFromFoodLibrary(text, profile, adminFoodLibrary);
  if (!kcalMatch?.[1] && !estimated) return null;
  const kcal = kcalMatch?.[1] ? Math.round(parseDecimalNumber(kcalMatch[1])) : estimated?.kcal || 0;
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  const cleanedName =
    estimated?.name ||
    text
      .replace(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calo|calories|cal)\b/gi, "")
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|gram)?\s*(?:carb|carbs|protein|đạm|dam|béo|beo|fat|xơ|xo|fiber)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() ||
    "Món vừa ghi";
  return {
    id: `${Date.now()}-chat-meal`,
    meal: detectMealFromText(text),
    name: cleanedName.slice(0, 64),
    kcal,
    carbs: extractMacroGram(text, ["carb", "carbs", "tinh bột", "tinh bot"]) ?? estimated?.carbs,
    protein: extractMacroGram(text, ["protein", "đạm", "dam", "chất đạm", "chat dam"]) ?? estimated?.protein,
    fat: extractMacroGram(text, ["fat", "béo", "beo", "chất béo", "chat beo"]) ?? estimated?.fat,
    fiber: extractMacroGram(text, ["fiber", "xơ", "xo", "chất xơ", "chat xo"]) ?? estimated?.fiber,
    price: extractMealPrice(text),
    createdAt: new Date().toISOString(),
  };
}
