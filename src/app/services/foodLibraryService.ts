import type { FoodServingUnit } from "./nutritionResolver";

export type NutrientCategory = "macro" | "mineral" | "vitamin" | "fatty_acid" | "amino_acid" | "other_compound" | "supplement";

export type NutrientDefinition = {
  key: string;
  name: string;
  unit: string;
  category: NutrientCategory;
  groupName?: string;
  sortOrder?: number;
};

/** One nutrient measured on a food item: the definition plus how much of it the item holds. */
export type FoodNutrientAmount = NutrientDefinition & {
  amount: number;
};

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
  /** Minerals, vitamins, fatty acids, supplements... beyond the five core macros. */
  nutrients?: FoodNutrientAmount[];
  tags?: string[];
  source: "admin" | "user";
  ownerEmail?: string;
  updatedAt: string;
};

/**
 * Selectable nutrients beyond the five core macros, mirroring the seeded rows of the
 * `nutrients` table. Each entry carries the unit its amount is measured in, so the
 * entry form and the detail panel never have to guess.
 */
export const NUTRIENT_CATALOG: NutrientDefinition[] = [
  // --- Carbohydrate ---
  { key: "sugar", name: "Đường tổng", unit: "g", category: "macro", groupName: "Carbohydrate", sortOrder: 10 },
  { key: "added_sugar", name: "Đường bổ sung", unit: "g", category: "macro", groupName: "Carbohydrate", sortOrder: 11 },
  { key: "starch", name: "Tinh bột", unit: "g", category: "macro", groupName: "Carbohydrate", sortOrder: 12 },
  { key: "sugar_alcohol", name: "Rượu đường (polyol)", unit: "g", category: "macro", groupName: "Carbohydrate", sortOrder: 13 },

  // --- Chất béo ---
  { key: "saturated_fat", name: "Béo bão hòa", unit: "g", category: "fatty_acid", groupName: "Chất béo", sortOrder: 20 },
  { key: "monounsaturated_fat", name: "Béo không bão hòa đơn", unit: "g", category: "fatty_acid", groupName: "Chất béo", sortOrder: 21 },
  { key: "polyunsaturated_fat", name: "Béo không bão hòa đa", unit: "g", category: "fatty_acid", groupName: "Chất béo", sortOrder: 22 },
  { key: "trans_fat", name: "Béo chuyển hóa (trans)", unit: "g", category: "fatty_acid", groupName: "Chất béo", sortOrder: 23 },
  { key: "cholesterol", name: "Cholesterol", unit: "mg", category: "other_compound", groupName: "Chất béo", sortOrder: 24 },
  { key: "omega_3", name: "Omega-3 tổng", unit: "mg", category: "fatty_acid", groupName: "Chất béo", sortOrder: 25 },
  { key: "omega_6", name: "Omega-6 tổng", unit: "mg", category: "fatty_acid", groupName: "Chất béo", sortOrder: 26 },
  { key: "epa", name: "EPA", unit: "mg", category: "fatty_acid", groupName: "Chất béo", sortOrder: 27 },
  { key: "dha", name: "DHA", unit: "mg", category: "fatty_acid", groupName: "Chất béo", sortOrder: 28 },

  // --- Khoáng chất đa lượng ---
  { key: "sodium", name: "Natri", unit: "mg", category: "mineral", groupName: "Khoáng chất", sortOrder: 30 },
  { key: "potassium", name: "Kali", unit: "mg", category: "mineral", groupName: "Khoáng chất", sortOrder: 31 },
  { key: "calcium", name: "Canxi", unit: "mg", category: "mineral", groupName: "Khoáng chất", sortOrder: 32 },
  { key: "magnesium", name: "Magie", unit: "mg", category: "mineral", groupName: "Khoáng chất", sortOrder: 33 },
  { key: "phosphorus", name: "Phốt pho", unit: "mg", category: "mineral", groupName: "Khoáng chất", sortOrder: 34 },
  { key: "chloride", name: "Clorua", unit: "mg", category: "mineral", groupName: "Khoáng chất", sortOrder: 35 },

  // --- Khoáng vi lượng ---
  { key: "iron", name: "Sắt", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 40 },
  { key: "zinc", name: "Kẽm", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 41 },
  { key: "copper", name: "Đồng", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 42 },
  { key: "manganese", name: "Mangan", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 43 },
  { key: "selenium", name: "Selen", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 44 },
  { key: "iodine", name: "I-ốt", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 45 },
  { key: "chromium", name: "Crom", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 46 },
  { key: "molybdenum", name: "Molypden", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", sortOrder: 47 },

  // --- Vitamin tan trong nước ---
  { key: "vitamin_c", name: "Vitamin C", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 50 },
  { key: "vitamin_b1", name: "B1 — Thiamin", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 51 },
  { key: "vitamin_b2", name: "B2 — Riboflavin", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 52 },
  { key: "vitamin_b3", name: "B3 — Niacin", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 53 },
  { key: "vitamin_b5", name: "B5 — Pantothenic", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 54 },
  { key: "vitamin_b6", name: "B6 — Pyridoxine", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 55 },
  { key: "vitamin_b7", name: "B7 — Biotin", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 56 },
  { key: "vitamin_b9", name: "B9 — Folate", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 57 },
  { key: "vitamin_b12", name: "B12 — Cobalamin", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 58 },
  { key: "choline", name: "Choline", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", sortOrder: 59 },

  // --- Vitamin tan trong dầu ---
  { key: "vitamin_a", name: "Vitamin A", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong dầu", sortOrder: 60 },
  { key: "vitamin_d", name: "Vitamin D", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong dầu", sortOrder: 61 },
  { key: "vitamin_e", name: "Vitamin E", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong dầu", sortOrder: 62 },
  { key: "vitamin_k", name: "Vitamin K", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong dầu", sortOrder: 63 },

  // --- Axit amin thiết yếu (BCAA đứng đầu vì liên quan trực tiếp tới tập luyện) ---
  { key: "leucine", name: "Leucine (BCAA)", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 70 },
  { key: "isoleucine", name: "Isoleucine (BCAA)", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 71 },
  { key: "valine", name: "Valine (BCAA)", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 72 },
  { key: "lysine", name: "Lysine", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 73 },
  { key: "methionine", name: "Methionine", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 74 },
  { key: "phenylalanine", name: "Phenylalanine", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 75 },
  { key: "threonine", name: "Threonine", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 76 },
  { key: "tryptophan", name: "Tryptophan", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 77 },
  { key: "histidine", name: "Histidine", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 78 },
  { key: "glutamine", name: "Glutamine", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 79 },
  { key: "arginine", name: "Arginine", unit: "mg", category: "amino_acid", groupName: "Axit amin", sortOrder: 80 },

  // --- Hoạt chất khác ---
  { key: "caffeine", name: "Caffeine", unit: "mg", category: "other_compound", groupName: "Hoạt chất khác", sortOrder: 90 },
  { key: "theobromine", name: "Theobromine", unit: "mg", category: "other_compound", groupName: "Hoạt chất khác", sortOrder: 91 },
  { key: "alcohol", name: "Cồn (ethanol)", unit: "g", category: "other_compound", groupName: "Hoạt chất khác", sortOrder: 92 },
  { key: "water", name: "Nước", unit: "g", category: "other_compound", groupName: "Hoạt chất khác", sortOrder: 93 },

  // --- Thực phẩm bổ sung ---
  { key: "creatine", name: "Creatine", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 100 },
  { key: "l_citrulline", name: "L-Citrulline", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 101 },
  { key: "beta_alanine", name: "Beta-Alanine", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 102 },
  { key: "taurine", name: "Taurine", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 103 },
  { key: "l_carnitine", name: "L-Carnitine", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 104 },
  { key: "collagen", name: "Collagen", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 105 },
  { key: "glucosamine", name: "Glucosamine", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 106 },
  { key: "probiotics", name: "Probiotic", unit: "CFU", category: "supplement", groupName: "Thực phẩm bổ sung", sortOrder: 107 },
];

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
