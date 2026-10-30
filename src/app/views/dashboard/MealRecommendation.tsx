import React from "react";
import { Pencil, Trash2, Utensils } from "lucide-react";
import { useEffect, useState } from "react";
import { mealActionLabel, type MealAction } from "../../agent/mealDecisionModel";
import { type MoneyCurrency } from "../../models/finance";
import { type UserProfile } from "../../models/profile";
import { answerChatWithLocalAi, isLocalAiProvider, resolveAiOverride } from "../../services/aiProviderService";
import { sendChatTurnToApi } from "../../services/magerLifeApiFacade";
import { formatCurrency } from "../../lib/format";
import { Glass, Mono, Progress } from "../../ui/primitives";
import { buildDashboardInsights } from "./insights";

export function MealRecommendation({
  insights,
  currency,
  profile,
  onProfileUpdate,
}: {
  insights: ReturnType<typeof buildDashboardInsights>;
  currency: MoneyCurrency;
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const mealCap = insights.recommendedMealCap;
  const livingJarName = insights.foodJar?.name || insights.livingJar?.name || "Ăn uống";
  const proteinText = insights.needsHighProtein ? "ưu tiên protein cao" : "ưu tiên no lâu, dễ kiểm soát";
  const prepText = insights.prefersMealPrep ? "hợp meal prep và tiết kiệm" : "phù hợp bữa thường ngày";
  const defaultMealSlots = [
    { id: "breakfast", name: "Sáng", share: 25, action: "home_high_protein" as MealAction },
    { id: "lunch", name: "Trưa", share: 40, action: "eat_out_controlled" as MealAction },
    { id: "dinner", name: "Tối", share: 35, action: "home_high_protein" as MealAction },
  ];
  const [editingMeals, setEditingMeals] = useState(false);
  const [apiMealAdvice, setApiMealAdvice] = useState("");
  const [apiMealAdviceStatus, setApiMealAdviceStatus] = useState<"idle" | "loading" | "error">("idle");
  const [mealSlots, setMealSlots] = useState(() => {
    const savedSlots = profile?.mealPlanSlots?.filter((meal) => meal.name && meal.share > 0);
    return savedSlots?.length ? savedSlots.map((meal) => ({ ...meal, action: meal.action as MealAction })) : defaultMealSlots;
  });

  useEffect(() => {
    if (editingMeals) return;
    const savedSlots = profile?.mealPlanSlots?.filter((meal) => meal.name && meal.share > 0);
    if (savedSlots?.length) setMealSlots(savedSlots.map((meal) => ({ ...meal, action: meal.action as MealAction })));
  }, [profile?.mealPlanSlots, editingMeals]);
  const totalShare = Math.max(1, mealSlots.reduce((sum, meal) => sum + meal.share, 0));
  const kcalBase = insights.remainingKcalToday > 0 ? insights.remainingKcalToday : insights.dailyKcalTarget;
  const slotBudget = (share: number) => (mealCap ? insights.mealBudgetPlan.todayCap * (share / totalShare) : 0);
  const slotSuggestion = (name: string, budget: number) => {
    const normalized = name.toLowerCase();
    if (budget > 0 && budget < (currency === "USD" ? 1.5 : 30_000)) {
      if (normalized.includes("phụ")) return ["chuối", "trứng luộc", "sữa chua nhỏ"];
      return ["cơm nhà", "trứng/đậu phụ", "rau/canh đơn giản"];
    }
    if (normalized.includes("phụ")) return ["Sữa chua/sữa", "chuối", "trứng hoặc đậu"];
    if (normalized.includes("trưa")) return ["Cơm phần tiết kiệm", "bún/phở chỉ khi đủ ngân sách", "ưu tiên thịt nạc"];
    if (normalized.includes("tối")) return ["protein nạc", "rau/canh", "giảm đồ chiên"];
    return ["Cơm/yến mạch/bánh mì vừa", "trứng/đậu phụ/ức gà", "trái cây hoặc rau"];
  };

  async function requestApiMealAdvice() {
    setApiMealAdviceStatus("loading");
    setApiMealAdvice("");
    const text = [
      "Hãy gợi ý món ăn thực tế cho hôm nay.",
      `Ngân sách ăn hôm nay: ${formatCurrency(insights.foodTodayCap, currency)}.`,
      `Kcal còn lại: ${insights.remainingKcalToday}/${insights.dailyKcalTarget} kcal.`,
      `Chế độ/ưu tiên: ${insights.needsHighProtein ? "ưu tiên protein cao" : "cân bằng"}, ${insights.prefersMealPrep ? "meal prep/tiết kiệm" : "ăn thường ngày"}.`,
      "Không gợi ý món vượt ngân sách. Nếu ngân sách dưới 30.000 VNĐ thì không gợi ý phở/bún/cơm phần mua ngoài.",
    ].join(" ");
    const aiSettings = profile?.aiSettings;
    try {
      if (aiSettings && isLocalAiProvider(aiSettings.provider)) {
        const local = await answerChatWithLocalAi({
          text,
          profile,
          clientContext: { currency, activeTab: "meal_recommendation", localTime: new Date().toISOString() },
          aiSettings,
        });
        setApiMealAdvice(local.message);
        setApiMealAdviceStatus("idle");
        return;
      }
      const result = await sendChatTurnToApi({
        text,
        profile,
        currency,
        activeTab: "meal_recommendation",
        aiOverride: resolveAiOverride(aiSettings),
      });
      if (result.ok && result.data?.message) {
        setApiMealAdvice(result.data.message);
        setApiMealAdviceStatus("idle");
        return;
      }
    } catch {
      // rơi xuống thông báo lỗi bên dưới.
    }
    setApiMealAdviceStatus("error");
    setApiMealAdvice("Chưa gọi được API gợi ý món. Hãy kiểm tra API server hoặc dùng gợi ý local tạm thời.");
  }

  function updateMealSlot(id: string, patch: Partial<(typeof mealSlots)[number]>) {
    setMealSlots((prev) => prev.map((meal) => (meal.id === id ? { ...meal, ...patch } : meal)));
  }

  function addMealSlot() {
    setMealSlots((prev) => [
      ...prev,
      { id: `snack-${Date.now()}`, name: `Phụ ${Math.max(1, prev.filter((meal) => meal.name.includes("Phụ")).length + 1)}`, share: 10, action: "snack_recovery" as MealAction },
    ]);
  }

  function removeMealSlot(id: string) {
    setMealSlots((prev) => (prev.length <= 1 ? prev : prev.filter((meal) => meal.id !== id)));
  }

  function toggleMealEditing() {
    if (editingMeals) {
      const normalizedSlots = mealSlots
        .map((meal) => ({ ...meal, name: meal.name.trim() || "Bữa ăn", share: Math.max(1, Number(meal.share) || 1) }))
        .filter((meal) => meal.name);
      setMealSlots(normalizedSlots);
      onProfileUpdate({ mealPlanSlots: normalizedSlots }, "Cập nhật cấu hình bữa ăn đề xuất");
    }
    setEditingMeals((prev) => !prev);
  }

  return (
    <Glass className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Mono className="text-emerald-700">Meal Recommendation · Free</Mono>
          <h2 className="mt-1 text-base font-bold text-slate-900">Gợi ý ăn uống theo hũ và kcal</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Bản Free chỉ gợi ý form bữa ăn. Người dùng tự nhập món, giá và kcal chi tiết khi cần.
          </p>
          <p className="mt-2 rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-slate-700">
            Ngân sách ăn uống: {insights.mealBudget}
          </p>
        </div>
        <Utensils className="h-5 w-5 text-emerald-500" />
      </div>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          ["Hũ đang dùng", livingJarName],
          ["Còn lại", formatCurrency(insights.foodRemaining, currency)],
          ["Chu kỳ", `${insights.foodRemainingDays} ngày`],
          ["Trần hôm nay", mealCap ? formatCurrency(mealCap, currency) : "--"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-emerald-100 bg-white/70 p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-600">Đã dùng hũ ăn uống</span>
          <span className="font-black text-slate-900">{insights.foodUsedRatio}%</span>
        </div>
        <Progress value={insights.foodUsedRatio} tone={insights.foodUsedRatio > 80 ? "bg-rose-400" : insights.foodUsedRatio > 60 ? "bg-amber-400" : "bg-emerald-500"} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/75 p-3 shadow-sm shadow-slate-100">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-slate-900">Cấu hình bữa ăn đề xuất</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Đây chỉ là đề xuất. Khi bạn chat món đã ăn/kcal/giá tiền, hệ thống sẽ tự tính lại phần còn lại trong ngày.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void requestApiMealAdvice()}
              disabled={apiMealAdviceStatus === "loading"}
              className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700 disabled:cursor-wait disabled:opacity-60"
            >
              {apiMealAdviceStatus === "loading" ? "Đang gọi API..." : "API gợi ý món"}
            </button>
            {editingMeals && (
              <button type="button" onClick={addMealSlot} className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                + Bữa
              </button>
            )}
            <button
              type="button"
              onClick={toggleMealEditing}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-black ${editingMeals ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600"}`}
            >
              <Pencil className="h-3.5 w-3.5" />
              {editingMeals ? "Xong" : "Chỉnh bữa"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[760px] rounded-xl border border-slate-100">
            {[
              ["Bữa", mealSlots.map((meal) => editingMeals ? (
                <div key={meal.id} className="flex items-center gap-2">
                  <input
                    value={meal.name}
                    onChange={(event) => updateMealSlot(meal.id, { name: event.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-black outline-none focus:border-emerald-300"
                  />
                  <button type="button" onClick={() => removeMealSlot(meal.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-rose-50 text-rose-500 disabled:opacity-40" disabled={mealSlots.length <= 1}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : <span key={meal.id} className="font-black text-slate-900">{meal.name}</span>)],
              ["Tỷ lệ", mealSlots.map((meal) => editingMeals ? (
                <input
                  key={meal.id}
                  type="number"
                  min={5}
                  max={80}
                  value={meal.share}
                  onChange={(event) => updateMealSlot(meal.id, { share: Math.max(1, Number(event.target.value) || 1) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold outline-none focus:border-emerald-300"
                />
              ) : <span key={meal.id}>{Math.round((meal.share / totalShare) * 100)}%</span>)],
              ["Ngân sách", mealSlots.map((meal) => {
                const value = mealCap ? insights.mealBudgetPlan.todayCap * (meal.share / totalShare) : 0;
                return <span key={meal.id} className="font-black text-slate-900">{value ? formatCurrency(value, currency) : "--"}</span>;
              })],
              ["Kcal còn lại", mealSlots.map((meal) => {
                const value = Math.round(kcalBase * (meal.share / totalShare));
                return <span key={meal.id} className="font-black text-amber-600">{value || "--"} kcal</span>;
              })],
              ["Model", mealSlots.map((meal) => {
                const score = Math.round((insights.mealModelScores.find((item) => item.action === meal.action)?.score || 0) * 100);
                return <span key={meal.id} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">{score}%</span>;
              })],
              ["Gợi ý", mealSlots.map((meal) => (
                <ul key={meal.id} className="space-y-1">
                  {slotSuggestion(meal.name, slotBudget(meal.share)).map((item) => (
                    <li key={item} className="flex gap-1.5 text-[11px] font-semibold leading-relaxed text-slate-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ))],
            ].map(([label, values]) => (
              <div key={label as string} className="grid border-b border-slate-100 last:border-b-0" style={{ gridTemplateColumns: `120px repeat(${mealSlots.length}, minmax(160px, 1fr))` }}>
                <div className="bg-slate-50 px-3 py-3 text-xs font-black uppercase tracking-wide text-slate-500">{label as string}</div>
                {(values as React.ReactNode[]).map((value, index) => (
                  <div key={`${label}-${index}`} className="border-l border-slate-100 px-3 py-3 text-xs text-slate-700">
                    {value}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800">
          Hệ thống đang chia theo hũ {livingJarName}, {proteinText}. {prepText}. Nếu cần tối ưu sâu theo món, giá và lịch tập, Meal Agent sẽ gọi API để đề xuất lại.
        </p>
        {apiMealAdvice && (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs font-semibold leading-relaxed ${apiMealAdviceStatus === "error" ? "border-rose-100 bg-rose-50 text-rose-700" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>
            {apiMealAdvice}
          </div>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
        Kcal duy trì: {insights.tdeeText}. Hướng kcal: {insights.kcalAdvice}. Nếu mục tiêu là giảm mỡ + tăng cơ, ưu tiên thâm hụt nhẹ và protein cao.
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Base model ranking</p>
          <span className="text-[11px] font-mono text-slate-400">{insights.mealModelInfo.name}</span>
        </div>
        <div className="space-y-2">
          {insights.mealModelScores.slice(0, 4).map((item) => (
            <div key={item.action} className="grid grid-cols-[1fr_44px] items-center gap-2">
              <span className="text-xs font-bold text-slate-700">{mealActionLabel(item.action)}</span>
              <span className="text-right text-xs font-black text-slate-900">{Math.round(item.score * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </Glass>
  );
}
