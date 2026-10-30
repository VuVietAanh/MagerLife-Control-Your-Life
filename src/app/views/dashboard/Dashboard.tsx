import { Calendar, Check, ChevronRight, Sparkles } from "lucide-react";
import { type Jar, type MoneyCurrency, type Transaction } from "../../models/finance";
import { type UserProfile } from "../../models/profile";
import { type FoodLibraryItem } from "../../services/foodLibraryService";
import { useRealtimeCalendar } from "../../hooks/useRealtimeCalendar";
import { Glass, Mono } from "../../ui/primitives";
import { StateEngine } from "./StateEngine";
import { MealRecommendation } from "./MealRecommendation";
import { RealtimeCalendarCard } from "./RealtimeCalendarCard";
import { WeatherForecastCard } from "./WeatherForecastCard";
import { buildDashboardInsights } from "./insights";
import { NutritionDashboardCard } from "./NutritionDashboardCard";
import { ChatPanel } from "./ChatPanel";

export function Dashboard({
  jars,
  transactions,
  profile,
  currency,
  adminFoodLibrary,
  onProfileUpdate,
}: {
  jars: Jar[];
  transactions: Transaction[];
  profile: UserProfile | null;
  currency: MoneyCurrency;
  adminFoodLibrary: FoodLibraryItem[];
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const insights = buildDashboardInsights(profile, jars, transactions, currency);
  const calendar = useRealtimeCalendar();

  return (
    <main className="p-4 grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)_430px] gap-4">
      <div className="space-y-4">
        <StateEngine insights={insights} />
        <RealtimeCalendarCard calendar={calendar} />
        <WeatherForecastCard />
      </div>
      <div className="space-y-4">
        <Glass className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Mono className="text-emerald-700">AI hiểu tôi</Mono>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Dashboard đã dùng dữ liệu thiết lập</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">
                Ưu tiên số 1, hũ tiền, giao dịch và kcal được gom lại để tạo khuyến nghị hằng ngày.
              </p>
            </div>
            <Sparkles className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              ["Ưu tiên", insights.priority],
              ["TDEE", insights.tdeeText],
              ["Ngân sách ăn", insights.mealBudget],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white/70 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-black leading-relaxed text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </Glass>
        <MealRecommendation insights={insights} currency={currency} profile={profile} onProfileUpdate={onProfileUpdate} />
        <Glass className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <Mono className="text-emerald-700">Energy-Aware Planner</Mono>
              <h2 className="text-base font-bold text-slate-900">Today</h2>
            </div>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>
          {[
            ["06:30", "Deep work", "Peak cognitive window", true],
            ["12:15", "Protein lunch", "Budget meal from Sinh hoạt", false],
            ["17:30", "Gym nhẹ", "Recovery-aware load", false],
            ["21:45", "Wind down", "Sleep debt control", false],
          ].map(([time, title, note, done]) => (
            <div key={String(time)} className={`flex items-center gap-3 py-3 border-b border-slate-100 last:border-0 ${done ? "opacity-45" : ""}`}>
              <Mono className="text-slate-400 w-10">{time}</Mono>
              <ChevronRight className="h-4 w-4 text-slate-300" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{title}</p>
                <p className="text-xs text-slate-500 truncate">{note}</p>
              </div>
              {done && <Check className="h-4 w-4 text-emerald-600" />}
            </div>
          ))}
        </Glass>
      </div>
      <div className="space-y-4">
        <ChatPanel jars={jars} profile={profile} currency={currency} adminFoodLibrary={adminFoodLibrary} onProfileUpdate={onProfileUpdate} />
        <NutritionDashboardCard profile={profile} insights={insights} onProfileUpdate={onProfileUpdate} />
      </div>
    </main>
  );
}
