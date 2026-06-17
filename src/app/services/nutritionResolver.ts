export type FoodServingUnit = "g" | "kg" | "ml" | "l";

export type FoodLibraryRecord = {
  id: string;
  name: string;
  aliases: string[];
  servingGram: number;
  servingUnit?: FoodServingUnit;
  kcalPer100g: number;
  carbsPer100g?: number;
  proteinPer100g?: number;
  fatPer100g?: number;
  fiberPer100g?: number;
};

export type ResolvedNutrition = {
  name: string;
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
};

export const FOOD_SERVING_UNITS: FoodServingUnit[] = ["g", "kg", "ml", "l"];

export function normalizeFoodServingUnit(unit?: string): FoodServingUnit {
  if (unit === "kg" || unit === "ml" || unit === "l") return unit;
  return "g";
}

export function toBaseNutritionAmount(value: number, unit?: string) {
  const normalizedUnit = normalizeFoodServingUnit(unit);
  return normalizedUnit === "kg" || normalizedUnit === "l" ? value * 1000 : value;
}

export function baseNutritionUnitLabel(unit?: string) {
  const normalizedUnit = normalizeFoodServingUnit(unit);
  return normalizedUnit === "ml" || normalizedUnit === "l" ? "ml" : "g";
}

function parseDecimalNumber(value: string) {
  return Number(value.replace(",", "."));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let column = 1; column <= b.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}

function fuzzyThreshold(value: string) {
  if (value.length <= 4) return 0;
  if (value.length <= 8) return 1;
  return 2;
}

function findFoodAliasInText(text: string, food: FoodLibraryRecord) {
  const candidates = [food.name, ...food.aliases]
    .map((item) => normalizeSearchText(item))
    .filter((item) => item.length >= 2);
  const exact = candidates.find((candidate) => text.includes(candidate));
  if (exact) return exact;

  const tokens = text.split(" ").filter(Boolean);
  for (const candidate of candidates) {
    const candidateTokens = candidate.split(" ").filter(Boolean);
    if (!candidateTokens.length) continue;
    for (let index = 0; index <= tokens.length - candidateTokens.length; index += 1) {
      const window = tokens.slice(index, index + candidateTokens.length).join(" ");
      if (levenshteinDistance(window, candidate) <= fuzzyThreshold(candidate)) return window;
    }
  }
  return "";
}

function countServingAmount(text: string, alias: string, food: FoodLibraryRecord) {
  const unitPattern = "(quả|qua|cái|cai|trái|trai|phần|phan|bát|bat|tô|to|chén|chen)";
  const before = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}\\s*(?:${alias})`, "i"));
  const after = text.match(new RegExp(`(?:${alias})\\D{0,10}(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`, "i"));
  const count = before?.[1] ? parseDecimalNumber(before[1]) : after?.[1] ? parseDecimalNumber(after[1]) : 0;
  if (!count) return 0;
  const isEgg = food.id.includes("egg") || normalizeSearchText(food.name).includes("trung");
  const perItemAmount = isEgg ? 37.5 : toBaseNutritionAmount(food.servingGram, food.servingUnit);
  return count * perItemAmount;
}

export function hasEverydayServingUnit(text: string) {
  const normalized = normalizeSearchText(text);
  return /\b\d+(?:[.,]\d+)?\s*(qua|cai|trai|phan|bat|to|chen|dia|hop|ly|coc|mieng)\b/i.test(normalized);
}

export function hasExplicitNutritionUnit(text: string) {
  const normalized = normalizeSearchText(text);
  return /\b\d+(?:[.,]\d+)?\s*(g|gr|gram|kg|ml|l)\b/i.test(normalized);
}

export function resolveNutritionFromFoodLibrary(text: string, library: FoodLibraryRecord[]): ResolvedNutrition | null {
  const normalized = normalizeSearchText(text);
  const totals = { kcal: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 };
  const matchedNames: string[] = [];

  library.forEach((food) => {
    const alias = findFoodAliasInText(normalized, food);
    if (!alias) return;

    const escapedAlias = escapeRegExp(alias);
    const unitPattern = "(g|gr|gram|kg|ml|l)";
    const before = normalized.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}\\s*(?:${escapedAlias})`, "i"));
    const after = normalized.match(new RegExp(`(?:${escapedAlias})\\D{0,12}(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`, "i"));
    const looseAmount = normalized.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|ml|l)/i);
    const explicitAmount = before?.[1] ? parseDecimalNumber(before[1]) : after?.[1] ? parseDecimalNumber(after[1]) : looseAmount?.[1] ? parseDecimalNumber(looseAmount[1]) : 0;
    const explicitUnit = before?.[2] || after?.[2] || looseAmount?.[2] || food.servingUnit;
    let baseAmount = explicitAmount ? toBaseNutritionAmount(explicitAmount, explicitUnit) : 0;
    if (!baseAmount) baseAmount = countServingAmount(normalized, escapedAlias, food);

    if (!baseAmount) baseAmount = toBaseNutritionAmount(food.servingGram, food.servingUnit);
    if (!baseAmount) return;

    const ratio = baseAmount / 100;
    totals.kcal += food.kcalPer100g * ratio;
    totals.carbs += (food.carbsPer100g || 0) * ratio;
    totals.protein += (food.proteinPer100g || 0) * ratio;
    totals.fat += (food.fatPer100g || 0) * ratio;
    totals.fiber += (food.fiberPer100g || 0) * ratio;
    matchedNames.push(`${food.name} ${Math.round(baseAmount)}${baseNutritionUnitLabel(food.servingUnit)}`);
  });

  if (!matchedNames.length || totals.kcal <= 0) return null;

  return {
    name: matchedNames.join(", "),
    kcal: Math.round(totals.kcal),
    carbs: Math.round(totals.carbs),
    protein: Math.round(totals.protein),
    fat: Math.round(totals.fat),
    fiber: Math.round(totals.fiber),
  };
}
