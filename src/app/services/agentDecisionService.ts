import type { MealAction } from "../agent/mealDecisionModel";
import { mealActionLabel } from "../agent/mealDecisionModel";
import type { AgentDecisionLog } from "../models/agent";

export type AgentDecisionInput = {
  mealModelName: string;
  topMealAction?: MealAction;
  topMealScore: number;
  mealAgentScore: number;
  financeAgentScore: number;
  plannerAgentScore: number;
  financeScore: number;
  foodMonthlyBudget: number;
  foodUsedRatio: number;
  foodBudgetFit: number;
  kcalFit: number;
  timePressureValue: number;
  recoveryNeedValue: number;
  budgetPressureValue: number;
  incomeTotal: number;
  scheduleFit: number;
  healthScore: number;
  livingUsedRatio: number;
  hasKcalData: boolean;
  dailyKcalIntake: number;
  dailyKcalTarget: number;
  kcalGuardStatus: "ok" | "near_limit" | "over_limit";
  kcalGuardRatio: number;
};

function makeDecisionId(agent: AgentDecisionLog["agent"]) {
  return `${Date.now()}-${agent.toLowerCase().replace(/\s+/g, "-")}`;
}

function rules(...items: Array<[string, boolean]>) {
  return items.filter(([, active]) => active).map(([name]) => name);
}

export function buildAgentDecisionLogs(input: AgentDecisionInput): AgentDecisionLog[] {
  const mealAction = input.topMealAction ? mealActionLabel(input.topMealAction) : "chưa có hành động";
  const mealRules = rules(
    ["budget_guard", input.foodMonthlyBudget > 0],
    ["meal_base_model", input.topMealScore > 0],
    ["kcal_fit_check", input.kcalFit > 0],
    ["kcal_daily_guard", input.kcalGuardStatus !== "ok"],
    ["time_pressure_check", input.timePressureValue > 55],
    ["recovery_need_check", input.recoveryNeedValue > 45],
    ["budget_pressure_check", input.budgetPressureValue > 70]
  );
  const financeRules = rules(
    ["jar_balance", true],
    ["food_spending_risk", input.foodUsedRatio > 70],
    ["cashflow_support_income", input.incomeTotal > 0]
  );
  const plannerRules = rules(
    ["energy_window", true],
    ["health_goal", input.hasKcalData],
    ["budget_guard", input.livingUsedRatio > 0]
  );

  return [
    {
      id: makeDecisionId("Meal Agent"),
      agent: "Meal Agent",
      input: "dashboard_meal_recommendation",
      rulesFired: mealRules,
      apiCalled: false,
      route: `${input.mealModelName} + ${mealRules.join(" + ") || "no_rule"}`,
      suggestion: input.foodMonthlyBudget
        ? `Model nền ưu tiên ${mealAction} (${Math.round(input.topMealScore * 100)}%). ${input.kcalGuardStatus === "over_limit" ? "Kcal đã vượt mục tiêu, bữa tiếp theo phải nhẹ." : input.kcalGuardStatus === "near_limit" ? "Kcal gần chạm mục tiêu, cần kiểm soát khẩu phần." : input.foodUsedRatio > 80 ? "Siết ngân sách, tránh ăn ngoài." : "Cho phép trong trần hôm nay."}`
        : "Chờ thiết lập ngân sách ăn/tháng.",
      confidence: input.mealAgentScore,
      userAction: "not_required",
      factors: [
        { label: "Base model", value: input.mealAgentScore },
        { label: "Budget fit", value: input.foodBudgetFit },
        { label: "Kcal fit", value: input.kcalFit },
        { label: "Daily kcal", value: Math.round(input.kcalGuardRatio * 100) },
        { label: "Time pressure", value: input.timePressureValue },
        { label: "Recovery need", value: input.recoveryNeedValue },
        { label: "Budget pressure", value: input.budgetPressureValue },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: makeDecisionId("Finance Agent"),
      agent: "Finance Agent",
      input: "dashboard_finance_guard",
      rulesFired: financeRules,
      apiCalled: false,
      route: `rules.${financeRules.join(" + ")}`,
      suggestion: input.foodUsedRatio > 70 ? "Cảnh báo ăn uống đang tiêu nhanh hơn nhịp tháng." : "Dòng tiền còn trong vùng kiểm soát.",
      confidence: input.financeAgentScore,
      userAction: "not_required",
      factors: [
        { label: "Finance score", value: input.financeScore },
        { label: "Food reserve", value: Math.max(0, 100 - input.foodUsedRatio) },
        { label: "Support income", value: input.incomeTotal > 0 ? 76 : 62 },
      ],
      createdAt: new Date().toISOString(),
    },
    {
      id: makeDecisionId("Planner Agent"),
      agent: "Planner Agent",
      input: "dashboard_planner_guard",
      rulesFired: plannerRules,
      apiCalled: false,
      route: `rules.${plannerRules.join(" + ")}`,
      suggestion: input.hasKcalData ? "Giữ lịch theo mục tiêu sức khỏe, tránh quyết định làm lệch ngân sách ăn." : "Cần thêm dữ liệu kcal để planner tự tin hơn.",
      confidence: input.plannerAgentScore,
      userAction: "not_required",
      factors: [
        { label: "Schedule fit", value: input.scheduleFit },
        { label: "Health score", value: input.healthScore },
        { label: "Budget guard", value: Math.max(45, 100 - input.livingUsedRatio) },
      ],
      createdAt: new Date().toISOString(),
    },
  ];
}
