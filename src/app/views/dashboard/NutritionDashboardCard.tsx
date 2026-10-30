import { Activity, Pencil, Trash2, Utensils, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { type NutritionMealLog, type NutritionMealName, type NutritionTrackingMode } from "../../models/nutrition";
import { type UserProfile } from "../../models/profile";
import { type FoodLibraryItem } from "../../services/foodLibraryService";
import { checkKcalDailyGuard } from "../../services/nutritionRuleService";
import { resolveNutritionByApiContract, type NutritionApiResolution } from "../../services/nutritionApiService";
import { formatCurrency } from "../../lib/format";
import { buildDashboardInsights } from "./insights";
import { normalizeFoodServingUnit } from "../../lib/nutritionText";
import { NutritionFactsPanel } from "../food/NutritionFactsPanel";

const mealIconSources: Record<NutritionMealLog["meal"], string> = {
  Sáng: "",
  Trưa: "",
  Tối: "",
  Phụ: "",
};

export function NutritionDashboardCard({
  profile,
  insights,
  onProfileUpdate,
}: {
  profile: UserProfile | null;
  insights: ReturnType<typeof buildDashboardInsights>;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const savedMode = profile?.nutritionTrackingMode || "day";
  const savedDietMode =
    profile?.nutritionDietMode ||
    (profile?.dietPreference?.toLowerCase().includes("high protein") || profile?.dietPreference?.toLowerCase().includes("protein")
      ? "High Protein"
      : profile?.dietPreference?.toLowerCase().includes("low carb")
        ? "Low Carb"
        : profile?.dietPreference?.toLowerCase().includes("meal prep")
          ? "Meal Prep"
          : "Cân bằng");
  const [mode, setMode] = useState<NutritionTrackingMode>(savedMode);
  const [dietMode, setDietMode] = useState(savedDietMode);
  const [selectedMeal, setSelectedMeal] = useState<NutritionMealLog["meal"] | "Tất cả">("Tất cả");
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const meals = profile?.nutritionMeals || [];
  const customFoods = profile?.customFoodItems || [];
  const pendingNutritionRequests = profile?.pendingNutritionApiRequests?.filter((item) => item.status === "pending") || [];
  const pendingApiCount = pendingNutritionRequests.length;
  const [apiResolutions, setApiResolutions] = useState<Record<string, NutritionApiResolution>>({});
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [foodDraft, setFoodDraft] = useState({
    name: "",
    aliases: "",
    servingGram: "100",
    servingUnit: "g",
    kcalPer100g: "",
    proteinPer100g: "",
    carbsPer100g: "",
    fatPer100g: "",
    fiberPer100g: "",
  });

  useEffect(() => {
    setMode(savedMode);
  }, [savedMode]);

  useEffect(() => {
    setDietMode(savedDietMode);
  }, [savedDietMode]);

  const dailyTarget = Number(insights.tdeeText.replace(/[^\d]/g, "")) || 2000;
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const dietChangeCount = profile?.nutritionDietModeChanges?.month === currentMonthKey ? profile.nutritionDietModeChanges.count : 0;
  const remainingDietChanges = Math.max(0, 3 - dietChangeCount);
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayMeals = meals.filter((meal) => meal.createdAt.slice(0, 10) === todayKey);
  const targetMultiplier = mode === "week" ? 7 : 1;
  const targetKcal = dailyTarget * targetMultiplier;
  const shownMeals = mode === "week" ? meals.slice(-21) : todayMeals;
  const visibleMeals = selectedMeal === "Tất cả" ? shownMeals : shownMeals.filter((meal) => meal.meal === selectedMeal);
  const intake = shownMeals.reduce((sum, meal) => sum + meal.kcal, 0);
  const burned = 0;
  const remaining = Math.max(0, targetKcal - intake + burned);
  const fillPercent = Math.max(0, Math.min(100, Math.round((intake / Math.max(targetKcal, 1)) * 100)));
  const kcalGuard = checkKcalDailyGuard(intake, targetKcal);
  const isHighProtein = dietMode.toLowerCase().includes("protein") || insights.needsHighProtein;
  const macroTargets = {
    carbs: Math.round((dailyTarget * (isHighProtein ? 0.42 : 0.5)) / 4) * targetMultiplier,
    protein: Math.round((dailyTarget * (isHighProtein ? 0.3 : 0.22)) / 4) * targetMultiplier,
    fat: Math.round((dailyTarget * 0.25) / 9) * targetMultiplier,
    fiber: 33 * targetMultiplier,
  };
  const macroUsed = {
    carbs: shownMeals.reduce((sum, meal) => sum + (meal.carbs || Math.round(meal.kcal * 0.5 / 4)), 0),
    protein: shownMeals.reduce((sum, meal) => sum + (meal.protein || Math.round(meal.kcal * (isHighProtein ? 0.3 : 0.22) / 4)), 0),
    fat: shownMeals.reduce((sum, meal) => sum + (meal.fat || Math.round(meal.kcal * 0.25 / 9)), 0),
    fiber: shownMeals.reduce((sum, meal) => sum + (meal.fiber || Math.round(meal.kcal / 120)), 0),
  };
  const currentWeekIndex = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const weeklyBars = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day, index) => {
    const used = index === currentWeekIndex ? intake : 0;
    return { day, used, percent: Math.max(6, Math.min(100, Math.round((used / Math.max(dailyTarget, 1)) * 100))) };
  });
  const mealPresets: Array<{ meal: NutritionMealLog["meal"]; tone: string }> = [
    { meal: "Sáng", tone: "from-amber-300 to-orange-400" },
    { meal: "Trưa", tone: "from-sky-300 to-blue-500" },
    { meal: "Tối", tone: "from-emerald-300 to-teal-500" },
    { meal: "Phụ", tone: "from-violet-300 to-fuchsia-500" },
  ];

  function updateMode(nextMode: NutritionTrackingMode) {
    setMode(nextMode);
    onProfileUpdate({ nutritionTrackingMode: nextMode }, `nutrition_tracking_mode=${nextMode}`);
  }

  function updateDietMode(nextDietMode: string) {
    if (nextDietMode === dietMode) return;
    if (remainingDietChanges <= 0) return;
    setDietMode(nextDietMode);
    onProfileUpdate(
      {
        nutritionDietMode: nextDietMode,
        nutritionDietModeChanges: { month: currentMonthKey, count: dietChangeCount + 1 },
        dietPreference: nextDietMode,
        preferenceWeights: {
          ...(profile?.preferenceWeights || {}),
          "nutrition.high_protein": nextDietMode.toLowerCase().includes("protein") ? 0.86 : 0.45,
          "nutrition.balance": nextDietMode === "Cân bằng" ? 0.82 : 0.55,
        },
      },
      `Chế độ ăn hiện tại: ${nextDietMode}`
    );
  }

  function updateMealSlot(mealId: string, nextMeal: NutritionMealLog["meal"]) {
    const nextMeals = meals.map((meal) => (meal.id === mealId ? { ...meal, meal: nextMeal } : meal));
    onProfileUpdate({ nutritionMeals: nextMeals }, `Sửa nhật ký ăn uống: chuyển món sang bữa ${nextMeal}`);
    setEditingMealId(null);
    if (selectedMeal !== "Tất cả") setSelectedMeal(nextMeal);
  }

  function deleteMealLog(mealId: string) {
    const deletedMeal = meals.find((meal) => meal.id === mealId);
    onProfileUpdate({ nutritionMeals: meals.filter((meal) => meal.id !== mealId) }, `Xóa nhật ký ăn uống: ${deletedMeal?.name || mealId}`);
    setEditingMealId(null);
  }

  async function resolvePendingNutrition(requestId: string) {
    const request = pendingNutritionRequests.find((item) => item.id === requestId);
    if (!request) return;
    setResolvingRequestId(requestId);
    const resolution = await resolveNutritionByApiContract(request, profile);
    setApiResolutions((prev) => ({ ...prev, [requestId]: resolution }));
    setResolvingRequestId(null);
  }

  function acceptNutritionSuggestion(requestId: string, suggestionIndex = 0) {
    const request = pendingNutritionRequests.find((item) => item.id === requestId);
    const suggestion = apiResolutions[requestId]?.suggestions[suggestionIndex];
    if (!request || !suggestion) return;
    const nextMeal: NutritionMealLog = {
      id: `${Date.now()}-api-meal`,
      meal: request.meal as NutritionMealLog["meal"],
      name: suggestion.name,
      kcal: suggestion.kcal,
      carbs: suggestion.carbs,
      protein: suggestion.protein,
      fat: suggestion.fat,
      fiber: suggestion.fiber,
      createdAt: new Date().toISOString(),
    };
    const nextRequests = (profile?.pendingNutritionApiRequests || []).map((item) => item.id === requestId ? { ...item, status: "resolved" as const } : item);
    onProfileUpdate(
      {
        nutritionMeals: [...meals, nextMeal],
        pendingNutritionApiRequests: nextRequests,
      },
      `User xác nhận API/LLM nutrition estimate: ${nextMeal.name} - ${nextMeal.kcal} kcal`
    );
  }

  function rejectNutritionSuggestion(requestId: string) {
    const request = pendingNutritionRequests.find((item) => item.id === requestId);
    const nextRequests = (profile?.pendingNutritionApiRequests || []).map((item) => item.id === requestId ? { ...item, status: "rejected" as const } : item);
    onProfileUpdate(
      { pendingNutritionApiRequests: nextRequests },
      `User từ chối API/LLM nutrition estimate: ${request?.text || requestId}`
    );
  }

  function addCustomFoodItem() {
    if (!foodDraft.name.trim()) return;
    const kcal = Number(foodDraft.kcalPer100g);
    if (!Number.isFinite(kcal) || kcal <= 0) return;
    const nextItem: FoodLibraryItem = {
      id: `${Date.now()}-user-food`,
      name: foodDraft.name.trim(),
      aliases: foodDraft.aliases
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      servingGram: Number(foodDraft.servingGram) || 100,
      servingUnit: normalizeFoodServingUnit(foodDraft.servingUnit),
      kcalPer100g: kcal,
      proteinPer100g: Number(foodDraft.proteinPer100g) || 0,
      carbsPer100g: Number(foodDraft.carbsPer100g) || 0,
      fatPer100g: Number(foodDraft.fatPer100g) || 0,
      fiberPer100g: Number(foodDraft.fiberPer100g) || 0,
      tags: ["user-custom"],
      source: "user",
      ownerEmail: profile?.email,
      updatedAt: new Date().toISOString(),
    };
    onProfileUpdate({ customFoodItems: [...customFoods, nextItem] }, `Custom food: ${nextItem.name}`);
    setFoodDraft({ name: "", aliases: "", servingGram: "100", servingUnit: "g", kcalPer100g: "", proteinPer100g: "", carbsPer100g: "", fatPer100g: "", fiberPer100g: "" });
  }

  function deleteCustomFoodItem(foodId: string) {
    onProfileUpdate({ customFoodItems: customFoods.filter((food) => food.id !== foodId) }, `Delete custom food: ${foodId}`);
  }

  const macroRows = [
    { label: "Carbs", used: macroUsed.carbs, target: macroTargets.carbs, tone: "bg-amber-400" },
    { label: "Chất đạm", used: macroUsed.protein, target: macroTargets.protein, tone: "bg-rose-400" },
    { label: "Chất béo", used: macroUsed.fat, target: macroTargets.fat, tone: "bg-lime-400" },
    { label: "Chất xơ", used: macroUsed.fiber, target: macroTargets.fiber, tone: "bg-emerald-400" },
  ];

  return (
    <section className="relative z-20 overflow-visible rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 text-slate-900 shadow-xl shadow-emerald-100/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="whitespace-nowrap text-xl font-black tracking-tight">Calo & Dinh dưỡng</h2>
        <div className="rounded-full border border-emerald-100 bg-white/80 p-1 shadow-inner shadow-emerald-100/70">
          {(["day", "week"] as NutritionTrackingMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => updateMode(item)}
              className={`rounded-full px-4 py-2 text-sm font-black transition ${mode === item ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "text-slate-500 hover:text-emerald-700"}`}
            >
              {item === "day" ? "Ngày" : "Tuần"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/80 p-3 shadow-sm shadow-emerald-100/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600">Chế độ ăn</span>
            <span className="group relative z-50 inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-xs font-black text-emerald-700">
              i
              <span className="pointer-events-none absolute left-1/2 top-8 z-[9999] hidden w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950 p-3 text-left text-xs font-semibold leading-relaxed text-white shadow-2xl group-hover:block">
                Hệ thống sẽ thay đổi chế độ. Bạn còn {remainingDietChanges} lần thay đổi trong tháng này để đạt hiệu quả tốt nhất.
              </span>
            </span>
          </div>
          <select
            value={dietMode}
            onChange={(event) => updateDietMode(event.target.value)}
            disabled={remainingDietChanges <= 0}
            className="min-w-[180px] rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-black text-emerald-700 outline-none shadow-inner shadow-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {["Cân bằng", "High Protein", "Meal Prep", "Low Carb", "Ăn truyền thống Việt Nam", "Ăn đơn giản, tiết kiệm"].map((option) => (
              <option key={option} value={option} className="bg-slate-900 text-white">
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      {pendingApiCount > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-xs font-bold leading-relaxed text-amber-900 shadow-sm shadow-amber-100/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{pendingApiCount} món chưa có trong kho đang chờ API/LLM ước tính.</span>
            <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-black text-amber-700">Cần xác nhận</span>
          </div>
          <div className="mt-3 space-y-2">
            {pendingNutritionRequests.slice(0, 3).map((request) => {
              const resolution = apiResolutions[request.id];
              const suggestion = resolution?.suggestions[0];
              return (
                <div key={request.id} className="rounded-xl border border-amber-100 bg-white/80 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900">{request.text}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">Bữa: {request.meal}</p>
                    </div>
                    {!suggestion && (
                      <button
                        type="button"
                        onClick={() => void resolvePendingNutrition(request.id)}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50"
                        disabled={resolvingRequestId === request.id}
                      >
                        {resolvingRequestId === request.id ? "Đang xử lý" : "Lấy gợi ý"}
                      </button>
                    )}
                  </div>
                  {suggestion && (
                    <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-900">{suggestion.name}</p>
                        <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-sky-700">{suggestion.kcal} kcal</span>
                      </div>
                      <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">
                        Confidence {Math.round(suggestion.confidence * 100)}% · {suggestion.note}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => acceptNutritionSuggestion(request.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black text-white">
                          Ghi vào nhật ký
                        </button>
                        <button type="button" onClick={() => rejectNutritionSuggestion(request.id)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-600">
                          Từ chối
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`mt-5 ${mode === "day" ? "grid grid-cols-[150px_1fr] items-center gap-5" : "space-y-4"}`}>
        {mode === "day" ? (
          <div className="relative mx-auto flex h-36 w-36 items-center justify-center rounded-full p-2 shadow-inner" style={{ backgroundColor: "#fff1eb", boxShadow: "inset 0 2px 12px rgba(255, 168, 125, 0.2)" }}>
            <style>{`
              @keyframes nutritionWaveDrift {
                0% { transform: translate3d(0, 0, 0); }
                100% { transform: translate3d(-50%, 0, 0); }
              }
            `}</style>
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border-[8px] bg-gradient-to-b from-sky-50 via-cyan-50 to-blue-100 shadow-lg" style={{ borderColor: "#ffa87d", boxShadow: "0 12px 28px rgba(255, 168, 125, 0.18)" }}>
              <div
                className="absolute inset-x-0 bottom-0 overflow-hidden transition-all duration-700"
                style={{ height: `${Math.max(8, fillPercent)}%` }}
              >
                <div className="absolute inset-x-0 top-5 h-[calc(100%-1.25rem)] bg-gradient-to-t from-blue-600 via-sky-400 to-cyan-200 opacity-90" />
                <svg
                  className="absolute left-0 top-[-20px] h-10 w-[200%]"
                  viewBox="0 0 240 36"
                  preserveAspectRatio="none"
                  style={{ animation: "nutritionWaveDrift 9s linear infinite", willChange: "transform" }}
                >
                  <path
                    d="M0 18 C20 5 40 5 60 18 C80 31 100 31 120 18 C140 5 160 5 180 18 C200 31 220 31 240 18 L240 36 L0 36 Z"
                    fill="rgba(56, 189, 248, 0.58)"
                  />
                </svg>
                <svg
                  className="absolute left-0 top-[-16px] h-9 w-[200%]"
                  viewBox="0 0 240 32"
                  preserveAspectRatio="none"
                  style={{ animation: "nutritionWaveDrift 13s linear -5s infinite", willChange: "transform" }}
                >
                  <path
                    d="M0 16 C24 26 36 26 60 16 C84 6 96 6 120 16 C144 26 156 26 180 16 C204 6 216 6 240 16 L240 32 L0 32 Z"
                    fill="rgba(255, 255, 255, 0.34)"
                  />
                </svg>
              </div>
              <div className="absolute inset-4 rounded-full border border-white/80" />
              <div className="absolute left-7 top-5 h-5 w-10 rotate-[-25deg] rounded-full bg-white/55 blur-[1px]" />
              <div className="absolute right-5 bottom-5 h-4 w-4 rounded-full bg-cyan-200/70" />
            <div className="relative z-10 text-center">
                <Zap className="mx-auto h-8 w-8 text-slate-900" />
                <p className="mt-2 text-xs font-black text-slate-800">Đã nạp</p>
                <p className="text-2xl font-black text-slate-950 drop-shadow-sm">{intake}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative mx-auto flex h-36 w-36 items-center justify-center rounded-full border-[10px] border-sky-100 bg-white shadow-lg shadow-sky-100/80 ring-1 ring-sky-200/70">
            <div className="text-center">
              <p className="text-3xl font-black text-amber-400">{intake}</p>
              <div className="mx-auto my-1 h-px w-16 bg-amber-300" />
              <p className="text-lg font-black text-slate-900">{targetKcal}</p>
            </div>
          </div>
        )}

        {mode === "day" ? (
          <div className="space-y-4">
            {[
              { icon: Zap, label: "Cần nạp", value: targetKcal, tone: "text-lime-400" },
              { icon: Utensils, label: "Còn lại", value: remaining, tone: "text-blue-400" },
              { icon: Activity, label: "Tiêu hao", value: burned, tone: "text-rose-400" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-4">
                  <Icon className={`h-8 w-8 ${item.tone}`} />
                  <div>
                    <p className="text-sm font-bold text-slate-500">{item.label}</p>
                    <p className="text-2xl font-black text-slate-900">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[22px] border border-sky-200 bg-white/85 p-4 shadow-lg shadow-sky-100/80 ring-1 ring-white">
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 shadow-sm shadow-amber-100/70">
                <p className="text-xs font-bold text-amber-700">Đã nạp tuần</p>
                <p className="mt-1 text-2xl font-black text-amber-500">{intake}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 shadow-sm shadow-emerald-100/70">
                <p className="text-xs font-bold text-emerald-700">Mục tiêu tuần</p>
                <p className="mt-1 text-2xl font-black text-slate-900">{targetKcal}</p>
              </div>
            </div>
            <div className="grid grid-cols-7 items-end gap-3">
              {weeklyBars.map((bar) => (
                <div key={bar.day} className="text-center">
                  <div className="mx-auto flex h-32 w-8 items-end rounded-full border border-slate-200 bg-slate-100 shadow-inner shadow-slate-200/70">
                    <span className="w-full rounded-full bg-gradient-to-t from-emerald-500 to-lime-300 transition-all" style={{ height: `${bar.percent}%` }} />
                  </div>
                  <p className="mt-2 text-sm font-black text-slate-900">{bar.day}</p>
                  <p className="mt-0.5 text-[10px] font-bold text-slate-400">{bar.used}/{dailyTarget}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className={`mt-4 rounded-2xl border px-3 py-2 text-xs font-bold leading-relaxed shadow-sm ${
          kcalGuard.status === "over_limit"
            ? "border-rose-200 bg-rose-50 text-rose-700 shadow-rose-100/70"
            : kcalGuard.status === "near_limit"
              ? "border-amber-200 bg-amber-50 text-amber-800 shadow-amber-100/70"
              : "border-emerald-100 bg-emerald-50 text-emerald-700 shadow-emerald-100/70"
        }`}
      >
        {kcalGuard.message}
      </div>

      <div className="my-5 border-t border-dashed border-emerald-200" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {macroRows.map((macro) => {
          const percent = Math.max(0, Math.min(100, Math.round((macro.used / Math.max(macro.target, 1)) * 100)));
          return (
            <div key={macro.label} className="rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-sm shadow-slate-100">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-600">{macro.label}</span>
                <span className="font-black text-slate-900">
                  {macro.used}<span className="font-medium text-slate-400">/{macro.target}g</span>
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <span className={`block h-full rounded-full ${macro.tone}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-100 bg-white/85 p-4 shadow-sm shadow-slate-100">
        <h3 className="text-lg font-black">Nhật kí ăn uống</h3>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {mealPresets.map((preset) => (
            <button key={preset.meal} type="button" onClick={() => setSelectedMeal(selectedMeal === preset.meal ? "Tất cả" : preset.meal)} className="group text-center">
              <span className={`relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br ${preset.tone} shadow-lg shadow-slate-200 ring-offset-2 ring-offset-white transition group-hover:-translate-y-1 group-hover:scale-105 ${selectedMeal === preset.meal ? "ring-2 ring-emerald-500" : ""}`}>
                {mealIconSources[preset.meal] ? (
                  <img src={mealIconSources[preset.meal]} alt="" className="h-9 w-9 object-contain" />
                ) : (
                  <Utensils className="h-6 w-6 text-white" />
                )}
              </span>
              <span className="mt-2 block text-sm font-bold text-slate-700">{preset.meal}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          {visibleMeals.length === 0 ? (
            <div className="py-3 text-center">
              <p className="text-base text-slate-500">Chưa có món nào trong {selectedMeal === "Tất cả" ? "khoảng này" : `bữa ${selectedMeal}`}</p>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-400">Nhắn cho chatbot tên món, định lượng và kcal để hệ thống tự cập nhật.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleMeals.slice(-6).map((meal) => (
                <div key={meal.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate font-bold text-slate-800">{meal.meal} · {meal.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {meal.price ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">{formatCurrency(meal.price, profile?.currency || "VND")}</span> : null}
                      <span className="font-black text-amber-500">{meal.kcal} kcal</span>
                      <button
                        type="button"
                        onClick={() => setEditingMealId(editingMealId === meal.id ? null : meal.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                        aria-label="Sửa bữa ăn"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {editingMealId === meal.id && (
                    <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-emerald-100 bg-white p-2">
                      <select
                        value={meal.meal}
                        onChange={(event) => updateMealSlot(meal.id, event.target.value as NutritionMealLog["meal"])}
                        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-emerald-300"
                      >
                        {(["Sáng", "Trưa", "Tối", "Phụ"] as NutritionMealName[]).map((option) => (
                          <option key={option} value={option}>
                            Chuyển sang bữa {option}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => deleteMealLog(meal.id)}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-2.5 text-xs font-black text-rose-600 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">Kho món cá nhân</h3>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
              Tự nhập món và thông số riêng. Khi chat đúng tên hoặc alias, hệ thống ưu tiên kho cá nhân trước kho Admin.
            </p>
          </div>
        </div>

        {pendingApiCount > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-700">
            {pendingApiCount} món đang chờ API/LLM ước tính vì chưa có trong kho dữ liệu.
          </div>
        )}

        <div className="mt-4 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={foodDraft.name}
             
              onChange={(event) => setFoodDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Tên món"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed"
            />
            <input
              value={foodDraft.aliases}
             
              onChange={(event) => setFoodDraft((prev) => ({ ...prev, aliases: event.target.value }))}
              placeholder="Alias, cách gọi khác"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={foodDraft.servingGram} onChange={(event) => setFoodDraft((prev) => ({ ...prev, servingGram: event.target.value }))} placeholder="Khẩu phần g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.kcalPer100g} onChange={(event) => setFoodDraft((prev) => ({ ...prev, kcalPer100g: event.target.value }))} placeholder="kcal/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.proteinPer100g} onChange={(event) => setFoodDraft((prev) => ({ ...prev, proteinPer100g: event.target.value }))} placeholder="đạm/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={foodDraft.carbsPer100g} onChange={(event) => setFoodDraft((prev) => ({ ...prev, carbsPer100g: event.target.value }))} placeholder="carb/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.fatPer100g} onChange={(event) => setFoodDraft((prev) => ({ ...prev, fatPer100g: event.target.value }))} placeholder="béo/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.fiberPer100g} onChange={(event) => setFoodDraft((prev) => ({ ...prev, fiberPer100g: event.target.value }))} placeholder="xơ/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
          </div>
          <button
            type="button"
           
            onClick={addCustomFoodItem}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white shadow-lg shadow-slate-200 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Lưu món cá nhân
          </button>
        </div>

        {customFoods.length > 0 && (
          <div className="mt-4 space-y-2">
            {customFoods.slice(-4).map((food) => (
              <div key={food.id} className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-800">{food.name}</p>
                    <p className="text-[10px] text-slate-400">
                      trên {food.servingGram || 100}{food.servingUnit || "g"}
                    </p>
                  </div>
                  <button type="button" onClick={() => deleteCustomFoodItem(food.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-white text-rose-500 hover:bg-rose-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <NutritionFactsPanel food={food} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
