export type MoneyCurrency = "VND" | "USD";

export type MealBudgetPlan = {
  monthlyBudget: number;
  remainingAmount: number;
  cycleDays: number;
  dailyBudget: number;
  todayCap: number;
  usedRatio: number;
  allocations: {
    mainMeal: number;
    outsideMeal: number;
    snack: number;
    total: number;
  };
};

function currencyUnit(currency: MoneyCurrency) {
  return currency === "USD" ? 0.01 : 1000;
}

export function floorCurrencyAmount(value: number, currency: MoneyCurrency) {
  const unit = currencyUnit(currency);
  return Math.max(0, Math.floor(value / unit) * unit);
}

export function buildMealBudgetPlan({
  monthlyBudget,
  remainingAmount,
  currency,
  cycleDays = 30,
}: {
  monthlyBudget: number;
  remainingAmount: number;
  currency: MoneyCurrency;
  cycleDays?: number;
}): MealBudgetPlan {
  const safeMonthlyBudget = Math.max(0, monthlyBudget);
  const safeRemainingAmount = Math.max(0, remainingAmount);
  const safeCycleDays = Math.max(1, cycleDays);
  const dailyBudget = safeMonthlyBudget ? safeMonthlyBudget / safeCycleDays : 0;
  const todayCap = floorCurrencyAmount(Math.min(dailyBudget, safeRemainingAmount || dailyBudget), currency);
  const mainMeal = floorCurrencyAmount(todayCap * 0.45, currency);
  const outsideMeal = floorCurrencyAmount(todayCap * 0.35, currency);
  const snack = floorCurrencyAmount(Math.max(0, todayCap - mainMeal - outsideMeal), currency);
  const total = mainMeal + outsideMeal + snack;
  const usedRatio = safeMonthlyBudget
    ? Math.max(0, Math.min(100, Math.round(((safeMonthlyBudget - safeRemainingAmount) / safeMonthlyBudget) * 100)))
    : 0;

  return {
    monthlyBudget: safeMonthlyBudget,
    remainingAmount: safeRemainingAmount,
    cycleDays: safeCycleDays,
    dailyBudget,
    todayCap,
    usedRatio,
    allocations: {
      mainMeal,
      outsideMeal,
      snack,
      total,
    },
  };
}
