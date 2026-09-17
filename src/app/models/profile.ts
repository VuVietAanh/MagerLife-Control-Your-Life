import type { FoodLibraryItem } from "../services/foodLibraryService";
import type { PendingNutritionApiRequest } from "../services/nutritionApiService";
import type { MoneyCurrency } from "./finance";
import type { NutritionDietModeChanges, NutritionMealLog, NutritionTrackingMode } from "./nutrition";

export type SubscriptionPlan = "free" | "pro";

// "mock" = chỉ dùng rule engine local, không gọi model nào.
// "ollama" = model chạy ngay trên máy người dùng (free, không cần key).
// "groq" | "openai" | "xai" = provider trên mây, cần user tự đưa API key riêng.
export type AiProviderKey = "mock" | "ollama" | "groq" | "openai" | "xai";

export type AiSettings = {
  provider: AiProviderKey;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

export type UserProfile = {
  email: string;
  name?: string;
  birthday: string;
  gender: string;
  weight?: string;
  height?: string;
  job?: string;
  interests?: string;
  salary?: number;
  currency?: MoneyCurrency;
  subscriptionPlan?: SubscriptionPlan;
  role?: "user" | "admin";
  foodMonthlyBudget?: number;
  foodDailyBudget?: number;
  healthGoal?: "gain" | "maintain" | "lose";
  lifestyle?: string;
  trainingHabit?: string;
  dietPreference?: string;
  budgetStyle?: string;
  currentPriority?: string;
  goalSummary?: string;
  goalGroups?: {
    nutrition?: string;
    bodyChange?: string;
    training?: string;
    future?: string;
  };
  kcalRecommendation?: string;
  systemSuggestion?: string;
  supportStyle?: string;
  calorieNote?: string;
  nutritionTrackingMode?: NutritionTrackingMode;
  nutritionDietMode?: string;
  nutritionDietModeChanges?: NutritionDietModeChanges;
  nutritionMeals?: NutritionMealLog[];
  mealPlanSlots?: Array<{
    id: string;
    name: string;
    share: number;
    action: string;
  }>;
  customFoodItems?: FoodLibraryItem[];
  pendingNutritionApiRequests?: PendingNutritionApiRequest[];
  preferenceWeights?: Record<string, number>;
  customChoiceInputs?: Record<string, string>;
  customChoiceSummary?: string;
  extractedSignals?: Record<string, number | string | boolean>;
  setupComplete?: boolean;
  aiSettings?: AiSettings;
};
