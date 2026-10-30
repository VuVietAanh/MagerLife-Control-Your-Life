import { Activity, Brain, Calendar, Utensils, Wallet } from "lucide-react";
import { getMealDecisionModelInfo, rankMealActions, type MealAction, type MealDecisionContext } from "../../agent/mealDecisionModel";
import { type Jar, type MoneyCurrency, type Transaction } from "../../models/finance";
import { type UserProfile } from "../../models/profile";
import { buildAgentDecisionLogs } from "../../services/agentDecisionService";
import { buildMealBudgetPlan } from "../../services/mealBudgetService";
import { checkKcalDailyGuard } from "../../services/nutritionRuleService";
import { profileSignalChips } from "../../services/profileService";
import { formatCurrency } from "../../lib/format";

export function buildDashboardInsights(profile: UserProfile | null, jars: Jar[], transactions: Transaction[], currency: MoneyCurrency) {
  const incomeTotal = transactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : 0), 0);
  const expenseTotal = transactions.reduce((sum, tx) => sum + (tx.type === "expense" ? tx.amount : 0), 0);
  const livingJar = jars.find((jar) => jar.id === "necessities" || jar.name.includes("Sinh hoạt")) || jars[0];
  const healthJar = jars.find((jar) => jar.id === "health" || jar.name.includes("Sức khỏe"));
  const livingUsed = livingJar ? Math.max(0, livingJar.monthlyAllocation - livingJar.balance) : 0;
  const livingUsedRatio = livingJar?.monthlyAllocation ? Math.round((livingUsed / livingJar.monthlyAllocation) * 100) : 0;
  const totalRemaining = jars.reduce((sum, jar) => sum + jar.balance, 0);
  const totalAllocation = jars.reduce((sum, jar) => sum + jar.monthlyAllocation, 0);
  const financeScore = totalAllocation ? Math.max(20, Math.min(100, Math.round((totalRemaining / totalAllocation) * 100))) : 60;
  const hasKcalData = Boolean(profile?.calorieNote);
  const healthWeight = profile?.preferenceWeights?.["health.fat_loss"] || profile?.preferenceWeights?.["health.muscle_gain"] || 0.35;
  const financeWeight = profile?.preferenceWeights?.["finance.saving"] || 0.35;
  const healthScore = hasKcalData ? Math.round(62 + healthWeight * 28) : 45;
  const lifeScore = Math.round(financeScore * 0.42 + healthScore * 0.38 + Math.min(100, 55 + financeWeight * 30) * 0.2);
  const tdeeMatch = profile?.calorieNote?.match(/TDEE duy trì ([\d.,]+)/);
  const tdeeText = tdeeMatch?.[1] ? `${tdeeMatch[1]} kcal/ngày` : "Cần thêm dữ liệu kcal";
  const kcalAdvice = profile?.calorieNote?.includes("hướng kcal gợi ý:")
    ? profile.calorieNote.split("hướng kcal gợi ý:")[1]?.split(" cho mục tiêu")[0]?.trim()
    : "Ăn gần mức duy trì";
  const priority = profile?.currentPriority || "Chưa chọn ưu tiên";
  const mealBudget = livingJar ? `${formatCurrency(livingJar.balance, currency)} còn trong hũ ${livingJar.name}` : "Chưa có hũ sinh hoạt";
  const recommendedMealCap = livingJar ? Math.max(currency === "USD" ? 2 : 20_000, Math.round((livingJar.balance / 20) / (currency === "USD" ? 0.01 : 1000)) * (currency === "USD" ? 0.01 : 1000)) : 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDaysIncludingToday = Math.max(1, daysInMonth - now.getDate() + 1);
  const foodJar = jars.find((jar) => jar.id === "necessities" || jar.name.toLowerCase().includes("ăn uống") || jar.name.toLowerCase().includes("an uong")) || livingJar;
  const foodMonthlyBudget = foodJar?.monthlyAllocation || profile?.foodMonthlyBudget || (profile?.foodDailyBudget ? profile.foodDailyBudget * daysInMonth : 0);
  const foodRemaining = Math.max(0, foodJar?.balance ?? foodMonthlyBudget);
  const budgetCycleDays = 30;
  const mealBudgetPlan = buildMealBudgetPlan({
    monthlyBudget: foodMonthlyBudget,
    remainingAmount: foodRemaining,
    currency,
    cycleDays: budgetCycleDays,
  });
  const foodDailyBudget = mealBudgetPlan.dailyBudget;
  const foodTodayCap = mealBudgetPlan.todayCap;
  const foodUsedRatio = mealBudgetPlan.usedRatio;
  const mealBudgetByMonth = foodMonthlyBudget
    ? `${formatCurrency(foodMonthlyBudget, currency)}/tháng. Chia đều 30 ngày: ${formatCurrency(foodTodayCap, currency)}/ngày. Hũ còn ${formatCurrency(foodRemaining, currency)}.`
    : "Chưa thiết lập ngân sách ăn/tháng";
  const profileText = [profile?.goalSummary, profile?.dietPreference, profile?.trainingHabit, profile?.lifestyle, profile?.systemSuggestion, profile?.customChoiceSummary].filter(Boolean).join(" ").toLowerCase();
  const extractedSignals = profile?.extractedSignals || {};
  const signalNumber = (key: string) => Number(extractedSignals[key] || 0);
  const profileSignals = profileSignalChips(extractedSignals);
  const needsHighProtein = profileText.includes("tăng cơ") || profileText.includes("giảm mỡ") || profileText.includes("protein");
  const prefersMealPrep = profileText.includes("meal prep") || profileText.includes("tiết kiệm") || profile?.budgetStyle?.includes("tiết kiệm");
  const trainingFrequency = profileText.includes("5+") ? 5 : profileText.includes("3-4") ? 3 : profileText.includes("1-2") ? 1 : 0;
  const budgetStyleForModel: MealDecisionContext["budget_style"] =
    profile?.budgetStyle?.toLowerCase().includes("tiết kiệm")
      ? "strict"
      : profile?.budgetStyle?.toLowerCase().includes("thoải mái")
        ? "comfort"
        : profile?.budgetStyle?.toLowerCase().includes("cảm xúc")
          ? "emotional"
          : "balanced";
  const tdeeNumber = Number((tdeeMatch?.[1] || "").replace(/[^\d]/g, "")) || 2100;
  const sleepQualityScore = profileText.includes("rất kém") ? 0.1 : profileText.includes("kém") ? 0.25 : profileText.includes("bình thường") ? 0.5 : profileText.includes("rất tốt") ? 0.95 : profileText.includes("tốt") ? 0.8 : 0.55;
  const timePressure = signalNumber("custom_time_pressure") > 0 || profileText.includes("rất bận") || profileText.includes("làm việc theo ca") ? 0.82 : profileText.includes("khá bận") ? 0.62 : 0.38;
  const convenienceNeed = timePressure;
  const injuryRisk = signalNumber("custom_injury_risk") > 0 || profileText.includes("đau gối") || profileText.includes("đau lưng") || profileText.includes("thoát vị") ? 1 : 0;
  const stressRisk = signalNumber("custom_stress_risk") > 0 || profileText.includes("stress") || profileText.includes("căng thẳng") ? 1 : 0;
  const budgetPressure = signalNumber("custom_budget_pressure") > 0 || profileText.includes("rất tiết kiệm") || profileText.includes("tiết kiệm") ? 1 : 0;
  const vegetarianPreference = signalNumber("custom_vegetarian_preference") > 0 || profileText.includes("ăn chay") || profileText.includes("thuần chay") || profileText.includes("kết hợp chay") ? 1 : 0;
  const mealDecisionContext: MealDecisionContext = {
    monthly_income: profile?.salary || totalAllocation || 0,
    food_monthly_budget: foodMonthlyBudget,
    food_remaining: foodRemaining,
    days_left: budgetCycleDays,
    days_in_month: budgetCycleDays,
    planned_food_per_day: foodDailyBudget,
    food_remaining_per_day: foodTodayCap,
    tdee: tdeeNumber,
    training_frequency: trainingFrequency,
    budget_style: budgetStyleForModel,
    convenience_need: convenienceNeed,
    vegetarian_day: 0,
    goal_fat_loss: profileText.includes("giảm mỡ") || profileText.includes("giảm cân") ? 1 : 0,
    goal_muscle_gain: profileText.includes("tăng cơ") ? 1 : 0,
    goal_maintain: profileText.includes("duy trì") || profileText.includes("giữ cân") ? 1 : 0,
    goal_healthy_eating: profileText.includes("ăn lành mạnh") || profileText.includes("healthy") ? 1 : 0,
    sleep_quality_score: sleepQualityScore,
    injury_risk: injuryRisk,
    time_pressure: timePressure,
    stress_risk: stressRisk,
    budget_pressure: budgetPressure,
    high_protein_preference: needsHighProtein || signalNumber("custom_high_protein") > 0 ? 1 : 0,
    vegetarian_preference: vegetarianPreference,
  };
  const mealModelInfo = getMealDecisionModelInfo();
  const mealModelScores = rankMealActions(mealDecisionContext);
  const topMealModelScore = mealModelScores[0]?.score || 0;
  const foodBudgetFit = foodMonthlyBudget ? Math.max(0, Math.min(100, Math.round((foodTodayCap / Math.max(foodDailyBudget, 1)) * 100))) : 0;
  const kcalFit = hasKcalData ? (kcalAdvice.includes("Giảm") ? 86 : kcalAdvice.includes("Tăng") ? 78 : 82) : 42;
  const habitFit = prefersMealPrep ? 88 : 66;
  const scheduleFit = remainingDaysIncludingToday <= 7 ? 72 : 84;
  const mealAgentScore = Math.round(topMealModelScore * 100);
  const todayKey = new Date().toISOString().slice(0, 10);
  const dailyKcalIntake = (profile?.nutritionMeals || [])
    .filter((meal) => meal.createdAt.slice(0, 10) === todayKey)
    .reduce((sum, meal) => sum + meal.kcal, 0);
  const dailyKcalGuard = checkKcalDailyGuard(dailyKcalIntake, tdeeNumber);
  const recoveryNeedValue = Math.min(100, Math.max(0, Math.round((1 - sleepQualityScore) * 100) + (stressRisk ? 20 : 0)));
  const timePressureValue = Math.round(timePressure * 100);
  const budgetPressureValue = budgetPressure ? 88 : Math.max(0, 100 - foodUsedRatio);
  const financeAgentScore = Math.round(financeScore * 0.45 + Math.max(0, 100 - foodUsedRatio) * 0.35 + (incomeTotal > 0 ? 76 : 62) * 0.2);
  const plannerAgentScore = Math.round(scheduleFit * 0.38 + healthScore * 0.32 + Math.max(45, 100 - livingUsedRatio) * 0.3);
  const agentDecisionLogs = buildAgentDecisionLogs({
    mealModelName: mealModelInfo.name,
    topMealAction: mealModelScores[0]?.action as MealAction | undefined,
    topMealScore: topMealModelScore,
    mealAgentScore,
    financeAgentScore,
    plannerAgentScore,
    financeScore,
    foodMonthlyBudget,
    foodUsedRatio,
    foodBudgetFit,
    kcalFit,
    timePressureValue,
    recoveryNeedValue,
    budgetPressureValue,
    incomeTotal,
    scheduleFit,
    healthScore,
    livingUsedRatio,
    hasKcalData,
    dailyKcalIntake,
    dailyKcalTarget: tdeeNumber,
    kcalGuardStatus: dailyKcalGuard.status,
    kcalGuardRatio: dailyKcalGuard.ratio,
  });
  const decisionIcons = {
    "Meal Agent": Utensils,
    "Finance Agent": Wallet,
    "Planner Agent": Calendar,
  } as const;
  const agentDecisions = agentDecisionLogs.map((decisionLog) => ({
    ...decisionLog,
    icon: decisionIcons[decisionLog.agent as keyof typeof decisionIcons] || Brain,
    score: decisionLog.confidence,
    decision: decisionLog.suggestion,
  }));
  const actions = [
    {
      title: "Ăn uống hôm nay",
      text: foodMonthlyBudget
        ? `Hũ ${foodJar?.name || "Ăn uống"} chia theo chu kỳ 30 ngày. Hôm nay nên giữ quanh ${formatCurrency(foodTodayCap, currency)} và ưu tiên món no, giàu protein.`
        : "Thiết lập ngân sách ăn/tháng để hệ thống không gợi ý vượt chỉ tiêu.",
      icon: Utensils,
      tone: "border-emerald-100 bg-emerald-50 text-emerald-800",
    },
    {
      title: "Kcal",
      text: hasKcalData ? `${tdeeText}. Khuyến nghị: ${kcalAdvice}.` : "Bổ sung cân nặng, chiều cao, ngày sinh và giới tính để tính TDEE.",
      icon: Activity,
      tone: "border-blue-100 bg-blue-50 text-blue-800",
    },
    {
      title: "Tài chính",
      text: livingUsedRatio > 70
        ? `Hũ ${livingJar?.name} đã dùng khoảng ${livingUsedRatio}%. Nên giảm ăn ngoài hoặc chuyển sang meal prep trong tuần này.`
        : `Tổng chi đã ghi nhận ${formatCurrency(expenseTotal, currency)}. Chu cấp thêm ${formatCurrency(incomeTotal, currency)}.`,
      icon: Wallet,
      tone: "border-violet-100 bg-violet-50 text-violet-800",
    },
  ];

  return {
    lifeScore,
    financeScore,
    healthScore,
    priority,
    tdeeText,
    kcalAdvice,
    mealBudget: mealBudgetByMonth,
    livingJar,
    foodJar,
    foodMonthlyBudget,
    foodRemaining,
    foodDailyBudget,
    foodTodayCap,
    foodUsedRatio,
    foodRemainingDays: mealBudgetPlan.cycleDays,
    dailyKcalIntake,
    dailyKcalTarget: tdeeNumber,
    remainingKcalToday: Math.max(0, tdeeNumber - dailyKcalIntake),
    mealBudgetPlan,
    mealModelInfo,
    mealModelScores,
    profileSignals,
    recommendedMealCap: foodTodayCap,
    needsHighProtein,
    prefersMealPrep,
    livingUsedRatio,
    totalRemaining,
    healthJar,
    actions,
    agentDecisions,
    agentDecisionLogs,
  };
}
