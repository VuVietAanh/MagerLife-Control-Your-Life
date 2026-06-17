import type { FoodServingUnit } from "./nutritionResolver";

export type FoodLibraryItem = {
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
  tags?: string[];
  source: "admin" | "user";
  ownerEmail?: string;
  updatedAt: string;
};

export const FOOD_LIBRARY_STORAGE_KEY = "magerlife_admin_food_library_v1";

export const defaultAdminFoodLibrary: FoodLibraryItem[] = [
  {
    id: "food-rice",
    name: "Cơm trắng",
    aliases: ["cơm", "com", "rice", "cơm trắng"],
    servingGram: 100,
    servingUnit: "g",
    kcalPer100g: 130,
    carbsPer100g: 28,
    proteinPer100g: 2.7,
    fatPer100g: 0.3,
    fiberPer100g: 0.4,
    tags: ["tinh bột", "bữa chính"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "food-chicken-breast",
    name: "Ức gà",
    aliases: ["ức gà", "uc ga", "chicken breast"],
    servingGram: 100,
    servingUnit: "g",
    kcalPer100g: 165,
    carbsPer100g: 0,
    proteinPer100g: 31,
    fatPer100g: 3.6,
    fiberPer100g: 0,
    tags: ["protein cao", "lean protein"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "food-egg",
    name: "Trứng gà",
    aliases: ["trứng", "trung", "egg", "trứng gà"],
    servingGram: 50,
    servingUnit: "g",
    kcalPer100g: 155,
    carbsPer100g: 1.1,
    proteinPer100g: 13,
    fatPer100g: 11,
    fiberPer100g: 0,
    tags: ["protein", "bữa phụ"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "food-banana",
    name: "Chuối",
    aliases: ["chuối", "chuoi", "banana"],
    servingGram: 100,
    servingUnit: "g",
    kcalPer100g: 89,
    carbsPer100g: 23,
    proteinPer100g: 1.1,
    fatPer100g: 0.3,
    fiberPer100g: 2.6,
    tags: ["trái cây", "bữa phụ"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "food-yogurt",
    name: "Sữa chua",
    aliases: ["sữa chua", "sua chua", "yogurt"],
    servingGram: 100,
    servingUnit: "g",
    kcalPer100g: 61,
    carbsPer100g: 4.7,
    proteinPer100g: 3.5,
    fatPer100g: 3.3,
    fiberPer100g: 0,
    tags: ["bữa phụ", "dễ ăn"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "food-tofu",
    name: "Đậu phụ",
    aliases: ["đậu phụ", "dau phu", "tofu"],
    servingGram: 100,
    servingUnit: "g",
    kcalPer100g: 76,
    carbsPer100g: 1.9,
    proteinPer100g: 8,
    fatPer100g: 4.8,
    fiberPer100g: 0.3,
    tags: ["protein chay", "tiết kiệm"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "food-rice-noodle",
    name: "Bún",
    aliases: ["bún", "bun", "rice noodle"],
    servingGram: 100,
    servingUnit: "g",
    kcalPer100g: 110,
    carbsPer100g: 25,
    proteinPer100g: 1.7,
    fatPer100g: 0.2,
    fiberPer100g: 0.5,
    tags: ["tinh bột", "món Việt"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
  {
    id: "food-pho-noodle",
    name: "Phở",
    aliases: ["phở", "pho"],
    servingGram: 100,
    servingUnit: "g",
    kcalPer100g: 120,
    carbsPer100g: 26,
    proteinPer100g: 2.4,
    fatPer100g: 0.4,
    fiberPer100g: 0.6,
    tags: ["món Việt", "ăn ngoài"],
    source: "admin",
    updatedAt: "2026-06-08T00:00:00.000Z",
  },
];

export function loadAdminFoodLibrary(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  if (!storage) return defaultAdminFoodLibrary;
  try {
    const raw = storage.getItem(FOOD_LIBRARY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FoodLibraryItem[]) : defaultAdminFoodLibrary;
  } catch {
    return defaultAdminFoodLibrary;
  }
}

export function saveAdminFoodLibrary(foodLibrary: FoodLibraryItem[], storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  if (!storage) return;
  try {
    storage.setItem(FOOD_LIBRARY_STORAGE_KEY, JSON.stringify(foodLibrary));
  } catch {
    // Demo storage can fail in private mode.
  }
}
