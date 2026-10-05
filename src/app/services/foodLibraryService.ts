import type { FoodServingUnit } from "./nutritionResolver";

export type NutrientCategory = "macro" | "mineral" | "vitamin" | "fatty_acid" | "amino_acid" | "other_compound" | "supplement";

export type NutrientDefinition = {
  key: string;
  name: string;
  unit: string;
  category: NutrientCategory;
  /** Top-level section in the entry form, e.g. "Vitamin tan trong nước". */
  groupName?: string;
  /** Finer classification within the group — "BCAA", "Omega-3", "Nhóm B" — kept as
   *  metadata rather than folded into the name, so it can be filtered and relabelled. */
  subgroup?: string;
  /** True for the five macros stored as their own columns on food_library_items.
   *  They appear here so the catalog describes every nutrient, but the entry form
   *  skips them: they already have dedicated inputs, and writing them through the
   *  nutrient tables as well would store the same figure twice. */
  isCore?: boolean;
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
  // --- Cơ bản: lưu thành cột riêng trên food_library_items cho truy vấn nhanh.
  //     Có mặt ở đây để danh mục mô tả đầy đủ mọi chất; form nhập liệu bỏ qua
  //     chúng (isCore) vì đã có ô riêng phía trên.
  { key: "kcal", name: "Năng lượng", unit: "kcal", category: "macro", groupName: "Cơ bản", subgroup: "", isCore: true, sortOrder: 1 },
  { key: "protein", name: "Protein tổng", unit: "g", category: "macro", groupName: "Cơ bản", subgroup: "", isCore: true, sortOrder: 2 },
  { key: "carbs", name: "Carbohydrate tổng", unit: "g", category: "macro", groupName: "Cơ bản", subgroup: "", isCore: true, sortOrder: 3 },
  { key: "fat", name: "Chất béo tổng", unit: "g", category: "macro", groupName: "Cơ bản", subgroup: "", isCore: true, sortOrder: 4 },
  { key: "fiber", name: "Chất xơ tổng", unit: "g", category: "macro", groupName: "Cơ bản", subgroup: "", isCore: true, sortOrder: 5 },

  // --- Carbohydrate ---
  { key: "sugar", name: "Đường tổng", unit: "g", category: "macro", groupName: "Carbohydrate", subgroup: "Đường", isCore: false, sortOrder: 10 },
  { key: "added_sugar", name: "Đường bổ sung", unit: "g", category: "macro", groupName: "Carbohydrate", subgroup: "Đường", isCore: false, sortOrder: 11 },
  { key: "starch", name: "Tinh bột", unit: "g", category: "macro", groupName: "Carbohydrate", subgroup: "", isCore: false, sortOrder: 12 },
  { key: "sugar_alcohol", name: "Rượu đường (polyol)", unit: "g", category: "macro", groupName: "Carbohydrate", subgroup: "", isCore: false, sortOrder: 13 },
  { key: "soluble_fiber", name: "Chất xơ hòa tan", unit: "g", category: "macro", groupName: "Carbohydrate", subgroup: "Chất xơ", isCore: false, sortOrder: 14 },
  { key: "insoluble_fiber", name: "Chất xơ không hòa tan", unit: "g", category: "macro", groupName: "Carbohydrate", subgroup: "Chất xơ", isCore: false, sortOrder: 15 },

  // --- Chất béo ---
  { key: "saturated_fat", name: "Béo bão hòa", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "", isCore: false, sortOrder: 20 },
  { key: "monounsaturated_fat", name: "Béo không bão hòa đơn", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "", isCore: false, sortOrder: 21 },
  { key: "polyunsaturated_fat", name: "Béo không bão hòa đa", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "", isCore: false, sortOrder: 22 },
  { key: "trans_fat", name: "Béo chuyển hóa (trans)", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "", isCore: false, sortOrder: 23 },
  { key: "cholesterol", name: "Cholesterol", unit: "mg", category: "other_compound", groupName: "Chất béo", subgroup: "", isCore: false, sortOrder: 24 },
  { key: "omega_3", name: "Omega-3 tổng", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "Omega-3", isCore: false, sortOrder: 25 },
  { key: "ala", name: "ALA", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "Omega-3", isCore: false, sortOrder: 26 },
  { key: "epa", name: "EPA", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "Omega-3", isCore: false, sortOrder: 27 },
  { key: "dha", name: "DHA", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "Omega-3", isCore: false, sortOrder: 28 },
  { key: "dpa", name: "DPA", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "Omega-3", isCore: false, sortOrder: 29 },
  { key: "omega_6", name: "Omega-6 tổng", unit: "g", category: "fatty_acid", groupName: "Chất béo", subgroup: "Omega-6", isCore: false, sortOrder: 30 },

  // --- Khoáng chất đa lượng ---
  { key: "sodium", name: "Natri", unit: "mg", category: "mineral", groupName: "Khoáng chất", subgroup: "", isCore: false, sortOrder: 40 },
  { key: "potassium", name: "Kali", unit: "mg", category: "mineral", groupName: "Khoáng chất", subgroup: "", isCore: false, sortOrder: 41 },
  { key: "calcium", name: "Canxi", unit: "mg", category: "mineral", groupName: "Khoáng chất", subgroup: "", isCore: false, sortOrder: 42 },
  { key: "magnesium", name: "Magie", unit: "mg", category: "mineral", groupName: "Khoáng chất", subgroup: "", isCore: false, sortOrder: 43 },
  { key: "phosphorus", name: "Phốt pho", unit: "mg", category: "mineral", groupName: "Khoáng chất", subgroup: "", isCore: false, sortOrder: 44 },
  { key: "chloride", name: "Clorua", unit: "mg", category: "mineral", groupName: "Khoáng chất", subgroup: "", isCore: false, sortOrder: 45 },

  // --- Khoáng vi lượng ---
  { key: "iron", name: "Sắt", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 50 },
  { key: "zinc", name: "Kẽm", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 51 },
  { key: "copper", name: "Đồng", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 52 },
  { key: "manganese", name: "Mangan", unit: "mg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 53 },
  { key: "selenium", name: "Selen", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 54 },
  { key: "iodine", name: "I-ốt", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 55 },
  { key: "chromium", name: "Crom", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 56 },
  { key: "molybdenum", name: "Molypden", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 57 },
  { key: "fluoride", name: "Florua", unit: "mcg", category: "mineral", groupName: "Khoáng vi lượng", subgroup: "", isCore: false, sortOrder: 58 },

  // --- Vitamin tan trong nước ---
  { key: "vitamin_c", name: "Vitamin C", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "", isCore: false, sortOrder: 60 },
  { key: "vitamin_b1", name: "B1 — Thiamin", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 61 },
  { key: "vitamin_b2", name: "B2 — Riboflavin", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 62 },
  { key: "vitamin_b3", name: "B3 — Niacin", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 63 },
  { key: "vitamin_b5", name: "B5 — Pantothenic", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 64 },
  { key: "vitamin_b6", name: "B6 — Pyridoxine", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 65 },
  { key: "vitamin_b7", name: "B7 — Biotin", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 66 },
  { key: "vitamin_b9", name: "B9 — Folate", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 67 },
  { key: "vitamin_b12", name: "B12 — Cobalamin", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "Nhóm B", isCore: false, sortOrder: 68 },
  { key: "choline", name: "Choline", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong nước", subgroup: "", isCore: false, sortOrder: 69 },

  // --- Vitamin tan trong dầu ---
  { key: "vitamin_a", name: "Vitamin A", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong dầu", subgroup: "", isCore: false, sortOrder: 70 },
  { key: "vitamin_d", name: "Vitamin D", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong dầu", subgroup: "", isCore: false, sortOrder: 71 },
  { key: "vitamin_e", name: "Vitamin E", unit: "mg", category: "vitamin", groupName: "Vitamin tan trong dầu", subgroup: "", isCore: false, sortOrder: 72 },
  { key: "vitamin_k", name: "Vitamin K", unit: "mcg", category: "vitamin", groupName: "Vitamin tan trong dầu", subgroup: "", isCore: false, sortOrder: 73 },

  // --- Axit amin: đủ 20 loại proteinogenic. BCAA nằm ở subgroup, không nhét vào tên.
  { key: "leucine", name: "Leucine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "BCAA", isCore: false, sortOrder: 80 },
  { key: "isoleucine", name: "Isoleucine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "BCAA", isCore: false, sortOrder: 81 },
  { key: "valine", name: "Valine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "BCAA", isCore: false, sortOrder: 82 },
  { key: "lysine", name: "Lysine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Thiết yếu", isCore: false, sortOrder: 83 },
  { key: "methionine", name: "Methionine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Thiết yếu", isCore: false, sortOrder: 84 },
  { key: "phenylalanine", name: "Phenylalanine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Thiết yếu", isCore: false, sortOrder: 85 },
  { key: "threonine", name: "Threonine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Thiết yếu", isCore: false, sortOrder: 86 },
  { key: "tryptophan", name: "Tryptophan", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Thiết yếu", isCore: false, sortOrder: 87 },
  { key: "histidine", name: "Histidine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Thiết yếu", isCore: false, sortOrder: 88 },
  { key: "arginine", name: "Arginine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Bán thiết yếu", isCore: false, sortOrder: 89 },
  { key: "cysteine", name: "Cysteine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Bán thiết yếu", isCore: false, sortOrder: 90 },
  { key: "glutamine", name: "Glutamine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Bán thiết yếu", isCore: false, sortOrder: 91 },
  { key: "glycine", name: "Glycine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Bán thiết yếu", isCore: false, sortOrder: 92 },
  { key: "proline", name: "Proline", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Bán thiết yếu", isCore: false, sortOrder: 93 },
  { key: "tyrosine", name: "Tyrosine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Bán thiết yếu", isCore: false, sortOrder: 94 },
  { key: "alanine", name: "Alanine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Không thiết yếu", isCore: false, sortOrder: 95 },
  { key: "asparagine", name: "Asparagine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Không thiết yếu", isCore: false, sortOrder: 96 },
  { key: "aspartic_acid", name: "Aspartic acid", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Không thiết yếu", isCore: false, sortOrder: 97 },
  { key: "glutamic_acid", name: "Glutamic acid", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Không thiết yếu", isCore: false, sortOrder: 98 },
  { key: "serine", name: "Serine", unit: "mg", category: "amino_acid", groupName: "Axit amin", subgroup: "Không thiết yếu", isCore: false, sortOrder: 99 },

  // --- Hoạt chất khác ---
  { key: "caffeine", name: "Caffeine", unit: "mg", category: "other_compound", groupName: "Hoạt chất khác", subgroup: "", isCore: false, sortOrder: 110 },
  { key: "theobromine", name: "Theobromine", unit: "mg", category: "other_compound", groupName: "Hoạt chất khác", subgroup: "", isCore: false, sortOrder: 111 },
  { key: "alcohol", name: "Cồn (ethanol)", unit: "g", category: "other_compound", groupName: "Hoạt chất khác", subgroup: "", isCore: false, sortOrder: 112 },
  { key: "water", name: "Nước", unit: "g", category: "other_compound", groupName: "Hoạt chất khác", subgroup: "", isCore: false, sortOrder: 113 },

  // --- Thực phẩm bổ sung ---
  { key: "creatine", name: "Creatine", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Thể thao", isCore: false, sortOrder: 120 },
  { key: "l_citrulline", name: "L-Citrulline", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Thể thao", isCore: false, sortOrder: 121 },
  { key: "beta_alanine", name: "Beta-Alanine", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Thể thao", isCore: false, sortOrder: 122 },
  { key: "hmb", name: "HMB", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Thể thao", isCore: false, sortOrder: 123 },
  { key: "taurine", name: "Taurine", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Thể thao", isCore: false, sortOrder: 124 },
  { key: "l_carnitine", name: "L-Carnitine", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Thể thao", isCore: false, sortOrder: 125 },
  { key: "collagen", name: "Collagen", unit: "g", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Khớp", isCore: false, sortOrder: 126 },
  { key: "glucosamine", name: "Glucosamine", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Khớp", isCore: false, sortOrder: 127 },
  { key: "chondroitin", name: "Chondroitin", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Khớp", isCore: false, sortOrder: 128 },
  { key: "msm", name: "MSM", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Khớp", isCore: false, sortOrder: 129 },
  { key: "coq10", name: "Coenzyme Q10", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Sức khỏe chung", isCore: false, sortOrder: 130 },
  { key: "inositol", name: "Inositol", unit: "mg", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Sức khỏe chung", isCore: false, sortOrder: 131 },
  { key: "probiotics", name: "Probiotic tổng", unit: "CFU", category: "supplement", groupName: "Thực phẩm bổ sung", subgroup: "Sức khỏe chung", isCore: false, sortOrder: 132 },
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
