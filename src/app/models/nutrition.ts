export type NutritionTrackingMode = "day" | "week";

export type NutritionMealName = "Sáng" | "Trưa" | "Tối" | "Phụ";

export type NutritionMealLog = {
  id: string;
  meal: NutritionMealName;
  name: string;
  kcal: number;
  carbs?: number;
  protein?: number;
  fat?: number;
  fiber?: number;
  price?: number;
  createdAt: string;
};

export type NutritionDietModeChanges = {
  month: string;
  count: number;
};
