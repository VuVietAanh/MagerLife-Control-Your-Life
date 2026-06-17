import mealDecisionModel from "../../../agent_training/models/meal_decision_model.json";

export type MealAction =
  | "home_high_protein"
  | "eat_out_controlled"
  | "meal_prep"
  | "snack_recovery"
  | "vegetarian_meal"
  | "sweet_treat";

export type MealDecisionContext = {
  monthly_income: number;
  food_monthly_budget: number;
  food_remaining: number;
  days_left: number;
  days_in_month: number;
  planned_food_per_day: number;
  food_remaining_per_day: number;
  tdee: number;
  training_frequency: number;
  budget_style: "strict" | "balanced" | "comfort" | "emotional";
  convenience_need: number;
  vegetarian_day: number;
  goal_fat_loss: number;
  goal_muscle_gain: number;
  goal_maintain: number;
  goal_healthy_eating: number;
  sleep_quality_score: number;
  injury_risk: number;
  time_pressure: number;
  stress_risk: number;
  budget_pressure: number;
  high_protein_preference: number;
  vegetarian_preference: number;
};

type ExportedMealModel = {
  model_name: string;
  model_type: string;
  feature_names: string[];
  means: number[];
  stds: number[];
  weights: number[];
  bias: number;
  threshold: number;
  actions: MealAction[];
  metrics?: Record<string, number>;
};

const model = mealDecisionModel as ExportedMealModel;

function sigmoid(value: number) {
  if (value < -35) return 0;
  if (value > 35) return 1;
  return 1 / (1 + Math.exp(-value));
}

function buildRawFeatureMap(context: MealDecisionContext, action: MealAction) {
  const values: Record<string, number> = {};
  for (const featureName of model.feature_names) values[featureName] = 0;

  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "number") values[key] = value;
  }

  values[`budget_style=${context.budget_style}`] = 1;
  values[`action=${action}`] = 1;

  const plannedFoodPerDay = Math.max(context.planned_food_per_day, 1);
  const monthlyIncome = Math.max(context.monthly_income, 1);
  const daysInMonth = Math.max(context.days_in_month, 1);

  values.budget_ratio = context.food_remaining_per_day / plannedFoodPerDay;
  values.food_budget_income_ratio = context.food_monthly_budget / monthlyIncome;
  values.remaining_month_ratio = Math.max(context.days_left, 1) / daysInMonth;
  values.high_training = context.training_frequency >= 3 ? 1 : 0;
  values.low_budget_pressure = context.food_remaining_per_day < plannedFoodPerDay * 0.75 ? 1 : 0;
  values.sleep_recovery_need = context.sleep_quality_score < 0.35 || context.stress_risk > 0 ? 1 : 0;
  values.personalization_pressure = (
    context.time_pressure
    + context.budget_pressure
    + context.injury_risk
    + context.vegetarian_preference
    + context.high_protein_preference
  ) / 5;

  return values;
}

export function scoreMealAction(context: MealDecisionContext, action: MealAction) {
  const rawMap = buildRawFeatureMap(context, action);
  const normalized = model.feature_names.map((featureName, index) => {
    const std = model.stds[index] || 1;
    return ((rawMap[featureName] || 0) - model.means[index]) / std;
  });
  const linearScore = normalized.reduce((sum, value, index) => sum + value * model.weights[index], model.bias);
  return sigmoid(linearScore);
}

export function rankMealActions(context: MealDecisionContext) {
  return model.actions
    .map((action) => ({ action, score: scoreMealAction(context, action) }))
    .sort((a, b) => b.score - a.score);
}

export function mealActionLabel(action: MealAction) {
  const labels: Record<MealAction, string> = {
    home_high_protein: "Bữa tự nấu giàu protein",
    eat_out_controlled: "Ăn ngoài có kiểm soát",
    meal_prep: "Meal prep",
    snack_recovery: "Bữa phụ phục hồi",
    vegetarian_meal: "Bữa chay",
    sweet_treat: "Đồ ngọt / ăn vặt",
  };
  return labels[action];
}

export function getMealDecisionModelInfo() {
  return {
    name: model.model_name,
    type: model.model_type,
    metrics: model.metrics || {},
    threshold: model.threshold,
  };
}
