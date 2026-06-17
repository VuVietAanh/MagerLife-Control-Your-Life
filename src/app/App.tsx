import {
  Activity,
  AlertCircle,
  Battery,
  Bot,
  Brain,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  CloudRain,
  Crown,
  Database,
  DollarSign,
  Droplets,
  Gauge,
  Heart,
  Info,
  Lock,
  MapPin,
  MessageSquare,
  Moon,
  Navigation,
  Pencil,
  Plus,
  Route,
  Save,
  Send,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Thermometer,
  Umbrella,
  Utensils,
  Wallet,
  X,
  Zap
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMealDecisionModelInfo, mealActionLabel, rankMealActions, type MealAction, type MealDecisionContext } from "./agent/mealDecisionModel";
import type { AuthDecorMode } from "./authDecorConfig";
import type { Memory, Message } from "./models/agent";
import type { Jar, MoneyCurrency, Transaction } from "./models/finance";
import type { NutritionMealLog, NutritionMealName, NutritionTrackingMode } from "./models/nutrition";
import type { SubscriptionPlan, UserProfile } from "./models/profile";
import { SeasonalDecor } from "./SeasonalDecor";
import { appendAgentEvent, classifyProfileUpdateEvent, loadAgentEvents, type AgentEvent } from "./services/agentEventService";
import { buildAgentDecisionLogs } from "./services/agentDecisionService";
import type { AdminAnalyticsResponse } from "./services/apiContracts";
import { getAuthAccount, saveAuthAccount } from "./services/authAccountService";
import { saveAuthSessionToken } from "./services/authSessionService";
import { appendAgentTrainingRecord, buildAdminAnalyticsSnapshot, loadAgentTrainingRecords, loadUserAccountRecords } from "./services/dataRepository";
import { resolveChatAgentTurn } from "./services/chatAgentService";
import {
  loadAdminFoodLibrary,
  saveAdminFoodLibrary,
  type FoodLibraryItem,
} from "./services/foodLibraryService";
import { buildMealBudgetPlan } from "./services/mealBudgetService";
import {
  FOOD_SERVING_UNITS,
  hasEverydayServingUnit,
  hasExplicitNutritionUnit,
  normalizeFoodServingUnit as serviceNormalizeFoodServingUnit,
  resolveNutritionFromFoodLibrary,
  type FoodServingUnit,
} from "./services/nutritionResolver";
import { checkKcalDailyGuard } from "./services/nutritionRuleService";
import { resolveNutritionByApiContract, type NutritionApiResolution } from "./services/nutritionApiService";
import {
  buildNextUserProfile,
  extractSignalsFromFreeText,
  parseProfilePatchFromText,
  profileSignalChips,
} from "./services/profileService";
import { buildAgentTrainingSamples, serializeTrainingSamplesAsJsonl } from "./services/trainingDatasetService";
import { MAGERLIFE_API_BASE_URL } from "./services/apiConfig";
import { getAdminAnalyticsFromApi, getApiDbHealth, getApiHealth, getFinanceSnapshotFromApi, getFoodLibraryFromApi, logNutritionMealToApi, loginAccountViaApi, registerAccountViaApi, saveFinanceSnapshotToApi, saveFoodLibraryToApi, saveProfileToApi, sendChatTurnToApi, syncAgentEventsToApi, syncPersistenceSnapshotToApi, updateProfileViaApi } from "./services/magerLifeApiFacade";
import { fetchWeatherForecast, resolveManualWeatherPlace, type WeatherPlace } from "./services/weatherService";

type Tab = "dashboard" | "finance" | "onboarding" | "account" | "admin" | "brain" | "routing" | "food-admin";

const foodServingUnits = FOOD_SERVING_UNITS;

function isLocalBrowserHost() {
  if (typeof window === "undefined") return true;
  return ["localhost", "127.0.0.1", ""].includes(window.location.hostname);
}

function analyzeBodyGoalText(text: string) {
  const normalized = text.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(normalized);
  const loseFat = has(/giảm\s*(cân\s*)?(về\s*)?(mỡ|fat)/) || has(/giảm\s*cân\s*mỡ/) || has(/siết/);
  const gainFat = has(/tăng\s*(cân\s*)?(về\s*)?mỡ/);
  const gainMuscle = has(/tăng\s*(cân\s*)?(về\s*)?(cơ|khối cơ|nạc|muscle)/) || has(/tăng\s*cân\s*cơ/) || has(/bulking/);
  const loseMuscle = has(/giảm\s*(cân\s*)?(về\s*)?(cơ|khối cơ|nạc|muscle)/);
  const loseWater = has(/giảm\s*nước/);
  const gainWater = has(/tăng\s*nước/);
  const loseWeight = has(/giảm\s*cân/) && !loseFat && !loseMuscle && !loseWater;
  const gainWeight = has(/tăng\s*cân/) && !gainMuscle && !gainFat && !gainWater;
  const maintain = has(/giữ\s*cân/) || has(/duy trì\s*cân/);
  return {
    loseFat,
    gainFat,
    gainMuscle,
    loseMuscle,
    loseWater,
    gainWater,
    loseWeight,
    gainWeight,
    maintain,
    recomposition: loseFat && gainMuscle && !loseWeight && !gainWeight,
  };
}

const salary = 28_000_000;

const initialJars: Jar[] = [
  {
    id: "necessities",
    name: "Sinh hoạt",
    emoji: "🏠",
    percentage: 42,
    balance: 8_240_000,
    monthlyAllocation: 11_760_000,
    purposeNote: "Nhà, ăn uống, đi lại, hóa đơn. Ưu tiên tiết kiệm nhưng không giảm protein.",
    linkedGoals: ["Fat loss", "Ổn định cashflow"],
  },
  {
    id: "family",
    name: "Gia đình",
    emoji: "❤️",
    percentage: 12,
    balance: 3_360_000,
    monthlyAllocation: 3_360_000,
    purposeNote: "Khoản gửi cố định cho ba mẹ, không dùng cho chi tiêu cá nhân.",
    linkedGoals: ["Trách nhiệm gia đình"],
  },
  {
    id: "learning",
    name: "Học tập",
    emoji: "📚",
    percentage: 12,
    balance: 2_280_000,
    monthlyAllocation: 3_360_000,
    purposeNote: "Sách, khóa học, công cụ AI phục vụ công việc và năng lực dài hạn.",
    linkedGoals: ["Nâng thu nhập"],
  },
  {
    id: "fitness",
    name: "Sức khỏe",
    emoji: "🏋️",
    percentage: 14,
    balance: 2_910_000,
    monthlyAllocation: 3_920_000,
    purposeNote: "Gym, thực phẩm giàu protein, khám sức khỏe, wearable cơ bản.",
    linkedGoals: ["Fat loss", "Recovery"],
  },
  {
    id: "invest",
    name: "Đầu tư",
    emoji: "📈",
    percentage: 15,
    balance: 4_200_000,
    monthlyAllocation: 4_200_000,
    purposeNote: "Quỹ dự phòng và đầu tư dài hạn. Không rút khi chưa có lý do khẩn cấp.",
    linkedGoals: ["Tự do tài chính"],
  },
];

const initialMemories: Memory[] = [
  {
    id: "m1",
    category: "goal",
    content: "Đang ưu tiên giảm mỡ nhưng vẫn cần giữ chi phí ăn uống hợp lý.",
    source: "user_input",
    confidence: 0.92,
    lastVerified: "2026-05-28",
  },
  {
    id: "m2",
    category: "finance",
    content: "Thu nhập chính khoảng 28 triệu/tháng, có khoản gia đình cố định.",
    source: "user_input",
    confidence: 0.88,
    lastVerified: "2026-05-28",
  },
  {
    id: "m3",
    category: "state",
    content: "Thiếu ngủ thường kéo theo delivery tăng vào cuối ngày.",
    source: "inferred",
    confidence: 0.67,
    lastVerified: "2026-05-27",
  },
];

const initialTransactions: Transaction[] = [
  {
    id: "tx-1",
    jarId: "necessities",
    type: "expense",
    amount: 52000,
    itemName: "Bữa trưa protein cao",
    spentAt: "2026-05-31T12:15",
    note: "Ghi thủ công bản Free",
  },
  {
    id: "tx-2",
    jarId: "necessities",
    type: "expense",
    amount: 89000,
    itemName: "Giải trí cuối tuần",
    spentAt: "2026-05-30T20:30",
    note: "Phục hồi tinh thần",
  },
];

const agents = [
  { name: "Finance Agent", status: "watching", signal: "Sinh hoạt còn 70%", icon: Wallet },
  { name: "Health Agent", status: "planning", signal: "Protein thấp hơn mục tiêu", icon: Heart },
  { name: "Planner Agent", status: "ready", signal: "2 block tập trung còn trống", icon: Calendar },
  { name: "Memory Agent", status: "review", signal: "3 memory cần xác nhận", icon: Database },
];

const quickQuestions = [
  "Hôm nay tôi có nên ăn phở không?",
  "Tối nay nên tập gì nếu ngủ 6 tiếng?",
  "Tôi có nên mua khóa học 1.2 triệu không?",
];

function createStarterJars(monthlyIncome: number, foodMonthlyBudget = 0): Jar[] {
  return createStarterJarsForCurrency(monthlyIncome, "VND", foodMonthlyBudget);
}

function isFixedFoodJar(jar: Pick<Jar, "id" | "name">) {
  const name = jar.name.toLowerCase();
  return jar.id === "necessities" || name.includes("ăn uống") || name.includes("an uong");
}

function createStarterJarsForCurrency(monthlyIncome: number, currency: MoneyCurrency, foodMonthlyBudget = 0): Jar[] {
  const unit = currency === "USD" ? 0.01 : 1000;
  const clampedFoodBudget = Math.max(0, Math.min(foodMonthlyBudget, monthlyIncome));
  const hasFoodBudget = Number.isFinite(clampedFoodBudget) && clampedFoodBudget > 0;
  const foodPercentage = hasFoodBudget && monthlyIncome > 0 ? Number(((clampedFoodBudget / monthlyIncome) * 100).toFixed(1)) : 0;
  const baseNonFoodPercentage = initialJars.reduce((sum, jar) => sum + (jar.id === "necessities" ? 0 : jar.percentage), 0);
  const nonFoodScale = hasFoodBudget && baseNonFoodPercentage > 0 ? Math.min(1, Math.max(0, 100 - foodPercentage) / baseNonFoodPercentage) : 1;
  const effectiveJars = initialJars.map((jar) => {
    if (jar.id === "necessities" && hasFoodBudget) {
      return {
        ...jar,
        name: "Ăn uống",
        emoji: "🍱",
        percentage: foodPercentage,
        purposeNote: "Ngân sách ăn uống theo mong muốn ban đầu. Dùng để kiểm soát bữa chính, bữa phụ, ăn ngoài và meal recommendation.",
        linkedGoals: ["Ăn uống", "Meal budget", "High Protein"],
      };
    }
    return {
      ...jar,
      percentage: hasFoodBudget ? Number((jar.percentage * nonFoodScale).toFixed(1)) : jar.percentage,
    };
  });
  const targetTotal = effectiveJars.reduce((sum, jar) => sum + (jar.id === "necessities" && hasFoodBudget ? clampedFoodBudget : (monthlyIncome * jar.percentage) / 100), 0);
  const rawAllocations = effectiveJars.map((jar, index) => {
    const raw = jar.id === "necessities" && hasFoodBudget ? clampedFoodBudget : (monthlyIncome * jar.percentage) / 100;
    const floor = Math.floor(raw / unit) * unit;
    return { index, floor, fraction: raw - floor };
  });
  let remainder = Math.round(targetTotal / unit) * unit - rawAllocations.reduce((sum, item) => sum + item.floor, 0);
  const bonuses = new Array(effectiveJars.length).fill(0);
  const sortedAllocations = [...rawAllocations].sort((a, b) => b.fraction - a.fraction);
  for (const item of sortedAllocations) {
    if (remainder < unit - 1e-9) break;
    bonuses[item.index] += unit;
    remainder -= unit;
  }
  if (remainder > 1e-9) bonuses[sortedAllocations[0]?.index || 0] += remainder;

  return effectiveJars.map((jar, index) => {
    const suggestedAllocation = Number((rawAllocations[index].floor + bonuses[index]).toFixed(currency === "USD" ? 2 : 0));
    return {
      ...jar,
      balance: suggestedAllocation,
      monthlyAllocation: suggestedAllocation,
    };
  });
}

function createMemoriesFromProfile(profile: UserProfile): Memory[] {
  const memories: Memory[] = [
    {
      id: "profile-email",
      category: "preference",
      content: `Email đăng ký: ${profile.email}.`,
      source: "user_input",
      confidence: 0.99,
      lastVerified: "2026-06-02",
    },
    {
      id: "profile-demographic",
      category: "state",
      content: `Ngày sinh ${profile.birthday}, giới tính ${profile.gender}.`,
      source: "user_input",
      confidence: 0.96,
      lastVerified: "2026-06-02",
    },
  ];

  if (profile.salary) {
    memories.push({
      id: "profile-salary",
      category: "finance",
      content: `Thu nhập chính khoảng ${formatCurrency(profile.salary, profile.currency || "VND")}/tháng. Loại tiền mặc định: ${profile.currency || "VND"}. Free chưa hỗ trợ tự quy đổi tiền tệ; Premium có thể quy đổi theo tỷ giá thời gian thực.`,
      source: "user_input",
      confidence: 0.92,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.weight || profile.height || profile.healthGoal) {
    memories.push({
      id: "profile-health",
      category: "health",
      content: `Thông tin sức khỏe ban đầu: ${profile.weight || "chưa có"}kg, ${profile.height || "chưa có"}cm, mục tiêu ${profile.healthGoal || "chưa chọn"}.`,
      source: "user_input",
      confidence: 0.82,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.job) {
    memories.push({
      id: "profile-job",
      category: "state",
      content: `Nghề nghiệp: ${profile.job}. Thông tin này sẽ ảnh hưởng tới lịch trình, thu nhập và kế hoạch phát triển bản thân.`,
      source: "user_input",
      confidence: 0.86,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.interests) {
    memories.push({
      id: "profile-interests",
      category: "preference",
      content: `Nội dung quan tâm: ${profile.interests}. Tin cố định vẫn gồm thời tiết, luật đi đường, giá xăng dầu.`,
      source: "user_input",
      confidence: 0.78,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.lifestyle || profile.trainingHabit || profile.dietPreference) {
    memories.push({
      id: "profile-routines",
      category: "state",
      content: `Sinh hoạt: ${profile.lifestyle || "chưa chọn"}. Tập luyện: ${profile.trainingHabit || "chưa chọn"}. Ăn uống và mục tiêu tương lai: ${profile.dietPreference || "chưa chọn"}.`,
      source: "user_input",
      confidence: 0.84,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.currentPriority || profile.budgetStyle) {
    memories.push({
      id: "profile-priority",
      category: "preference",
      content: `Ưu tiên hiện tại: ${profile.currentPriority || "chưa chọn"}. Budget Style: ${profile.budgetStyle || "chưa chọn"}.`,
      source: "user_input",
      confidence: 0.9,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.calorieNote) {
    memories.push({
      id: "profile-calorie",
      category: "health",
      content: `${profile.calorieNote} Đây là mức gợi ý, cần điều chỉnh theo cân nặng, sức khỏe và phản hồi thực tế.`,
      source: "calculated",
      confidence: 0.78,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.preferenceWeights) {
    memories.push({
      id: "profile-weights",
      category: "preference",
      content: `Preference weights JSON: ${JSON.stringify(profile.preferenceWeights)}. Các trọng số này sẽ được cập nhật dần qua chat và hành vi người dùng.`,
      source: "calculated",
      confidence: 0.74,
      lastVerified: "2026-06-02",
    });
  }
  if (profile.customChoiceSummary || profile.extractedSignals) {
    const signalLabels = profileSignalChips(profile.extractedSignals).map((item) => item.label).join(", ") || "chưa có tín hiệu mạnh";
    memories.push({
      id: "profile-conversation-signals",
      category: "preference",
      content: `Dữ liệu bổ sung qua hội thoại: ${profile.customChoiceSummary || "chưa có ghi chú"}. Tín hiệu đã trích xuất: ${signalLabels}.`,
      source: "conversation_extraction",
      confidence: 0.76,
      lastVerified: "2026-06-07",
    });
  }
  return memories;
}

function money(value: number) {
  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
}

function safeText(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => safeText(item)).filter(Boolean).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function formatCurrency(value: number, currency: MoneyCurrency = "VND") {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (currency === "USD") return `$${safeValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${Math.round(safeValue).toLocaleString("vi-VN")} VNĐ`;
}

const usdToVndRate = 25_000;

function lunarInt(value: number) {
  return Math.floor(value);
}

function jdFromDate(day: number, month: number, year: number) {
  const a = lunarInt((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd = day + lunarInt((153 * m + 2) / 5) + 365 * y + lunarInt(y / 4) - lunarInt(y / 100) + lunarInt(y / 400) - 32045;
  if (jd < 2299161) jd = day + lunarInt((153 * m + 2) / 5) + 365 * y + lunarInt(y / 4) - 32083;
  return jd;
}

function getNewMoonDay(k: number, timeZone: number) {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const dr = Math.PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);
  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mpr = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  let c1 =
    (0.1734 - 0.000393 * t) * Math.sin(m * dr) +
    0.0021 * Math.sin(2 * dr * m) -
    0.4068 * Math.sin(mpr * dr) +
    0.0161 * Math.sin(2 * dr * mpr) -
    0.0004 * Math.sin(3 * dr * mpr) +
    0.0104 * Math.sin(2 * dr * f) -
    0.0051 * Math.sin((m + mpr) * dr) -
    0.0074 * Math.sin((m - mpr) * dr) +
    0.0004 * Math.sin((2 * f + m) * dr) -
    0.0004 * Math.sin((2 * f - m) * dr) -
    0.0006 * Math.sin((2 * f + mpr) * dr) +
    0.001 * Math.sin((2 * f - mpr) * dr) +
    0.0005 * Math.sin((2 * mpr + m) * dr);
  const deltaT = t < -11 ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3 : -0.000278 + 0.000265 * t + 0.000262 * t2;
  return lunarInt(jd1 + c1 - deltaT + 0.5 + timeZone / 24);
}

function getSunLongitude(dayNumber: number, timeZone: number) {
  const t = (dayNumber - 2451545.5 - timeZone / 24) / 36525;
  const t2 = t * t;
  const dr = Math.PI / 180;
  const m = 357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  let dl = (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(dr * m);
  dl += (0.019993 - 0.000101 * t) * Math.sin(2 * dr * m) + 0.00029 * Math.sin(3 * dr * m);
  let l = (l0 + dl) * dr;
  l -= Math.PI * 2 * lunarInt(l / (Math.PI * 2));
  return lunarInt((l / Math.PI) * 6);
}

function getLunarMonth11(year: number, timeZone: number) {
  const off = jdFromDate(31, 12, year) - 2415021;
  const k = lunarInt(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
  return nm;
}

function getLeapMonthOffset(a11: number, timeZone: number) {
  const k = lunarInt((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0;
  let i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i += 1;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

function getVietnameseLunarDate(date: Date) {
  const timeZone = 7;
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const dayNumber = jdFromDate(day, month, year);
  const k = lunarInt((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);
  let a11 = getLunarMonth11(year, timeZone);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = getLunarMonth11(year - 1, timeZone);
  } else {
    lunarYear = year + 1;
    b11 = getLunarMonth11(year + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = lunarInt((monthStart - a11) / 29);
  let lunarLeap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) lunarLeap = true;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, isLeap: lunarLeap };
}

function useRealtimeCalendar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const lunar = getVietnameseLunarDate(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const remainingDaysIncludingToday = daysInMonth - now.getDate() + 1;
  return {
    now,
    lunar,
    daysInMonth,
    remainingDaysIncludingToday,
    isVegetarianDay: lunar.day === 1 || lunar.day === 15,
    timeLabel: now.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    solarLabel: now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }),
    lunarLabel: `${lunar.day}/${lunar.month}${lunar.isLeap ? " nhuận" : ""}/${lunar.year}`,
  };
}

function useWeatherPlaces() {
  const [places, setPlaces] = useState<WeatherPlace[]>([]);
  const [activePlaceId, setActivePlaceId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Cho phép vị trí để MagerLife hiển thị thời tiết nơi bạn đang ở.");

  async function loadForecast(place: WeatherPlace) {
    setPlaces((prev) => prev.map((item) => item.id === place.id ? { ...item, status: "loading", error: "" } : item));
    try {
      const weather = await fetchWeatherForecast(place);
      setPlaces((prev) => prev.map((item) => item.id === place.id ? {
        ...item,
        status: "idle",
        weather,
      } : item));
    } catch (error) {
      setPlaces((prev) => prev.map((item) => item.id === place.id ? { ...item, status: "error", error: error instanceof Error ? error.message : "Lỗi thời tiết" } : item));
    }
  }

  function addPlace(place: WeatherPlace) {
    setPlaces((prev) => {
      const withoutDuplicate = prev.filter((item) => item.id !== place.id);
      const currentPlaces = withoutDuplicate.filter((item) => item.isCurrent);
      const manualPlaces = withoutDuplicate.filter((item) => !item.isCurrent);
      const nextManualPlaces = place.isCurrent ? manualPlaces : [place, ...manualPlaces].slice(0, 3);
      return [...(place.isCurrent ? [place] : currentPlaces), ...nextManualPlaces];
    });
    setActivePlaceId(place.id);
    void loadForecast(place);
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Trình duyệt hiện không hỗ trợ lấy vị trí.");
      return;
    }
    setMessage("Đang chờ quyền truy cập vị trí từ trình duyệt...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place: WeatherPlace = {
          id: "current-location",
          name: "Vị trí hiện tại",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          isCurrent: true,
        };
        setMessage("Đã cập nhật thời tiết theo vị trí hiện tại.");
        addPlace(place);
      },
      () => setMessage("Bạn chưa cấp quyền vị trí. Có thể thêm địa điểm thủ công bên dưới."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000 }
    );
  }

  async function addManualPlace() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const manualCount = places.filter((item) => !item.isCurrent).length;
    if (manualCount >= 3) {
      setMessage("Chỉ hỗ trợ tối đa 3 địa điểm tự thêm. Hãy xóa một nơi trước khi thêm mới.");
      return;
    }
    setMessage("Đang tìm địa điểm...");
    try {
      const place = await resolveManualWeatherPlace(trimmed);
      setQuery("");
      setMessage(`Đã thêm ${place.name}.`);
      addPlace(place);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thêm được địa điểm.");
    }
  }

  function removePlace(id: string) {
    setPlaces((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activePlaceId === id) setActivePlaceId(next[0]?.id || "");
      return next;
    });
  }

  useEffect(() => {
    requestCurrentLocation();
    // Ask once on dashboard mount; browser owns the permission prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { places, activePlaceId, setActivePlaceId, query, setQuery, message, requestCurrentLocation, addManualPlace, removePlace, reloadPlace: loadForecast };
}

function Glass({ children, className = "", ...props }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode; className?: string }) {
  return (
    <section {...props} className={`border border-white/70 bg-white/58 shadow-[0_8px_30px_rgba(15,23,42,0.07)] backdrop-blur-2xl rounded-lg ${className}`}>
      {children}
    </section>
  );
}

function Mono({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[10px] uppercase tracking-wide ${className}`}>{children}</span>;
}

function Progress({ value, tone = "bg-emerald-500" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function AuthStoryPanel() {
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const storyPoints = [
    [Check, "Theo dõi sống lành mạnh", "Xây dựng thói quen tốt cho bản thân."],
    [Zap, "Góc nhắc nhở hoạt động", "Gợi ý đúng lúc để bạn dùng thời gian và năng lượng hiệu quả hơn."],
    [Shield, "Quản lý nền tảng cá nhân", "Kết nối tài chính, sức khỏe, hành vi và lịch sống trong một Kế hoạch duy nhất và có thể ứng biến."],
  ];
  const systemNodes = [
    {
      id: "info",
      label: "Thông tin",
      value: "Dữ liệu nền",
      Icon: Info,
      tone: {
        card: "border-cyan-200/55 bg-cyan-400/10 shadow-cyan-950/30",
        orb: "from-cyan-100 via-cyan-300 to-teal-500 shadow-cyan-300/50",
        text: "text-cyan-50",
        beam: "from-cyan-200 via-cyan-300 to-transparent",
        ring: "border-cyan-200/45",
      },
      description: "Ghi nhận dữ liệu nền như mục tiêu, thói quen, ưu tiên và bối cảnh cá nhân.",
    },
    {
      id: "health",
      label: "Sức khỏe",
      value: "Kcal & vận động",
      Icon: Heart,
      tone: {
        card: "border-sky-300/45 bg-sky-400/10 shadow-sky-950/30",
        orb: "from-sky-100 via-sky-400 to-blue-600 shadow-sky-300/45",
        text: "text-sky-50",
        beam: "from-sky-100 via-sky-400 to-transparent",
        ring: "border-sky-300/45",
      },
      description: "Liên kết cân nặng, kcal, vận động, giấc ngủ và chế độ ăn để gợi ý phù hợp.",
    },
    {
      id: "manage",
      label: "Quản lý",
      value: "Lịch & thói quen",
      Icon: Settings,
      tone: {
        card: "border-blue-300/45 bg-blue-500/10 shadow-blue-950/30",
        orb: "from-blue-100 via-blue-500 to-indigo-700 shadow-blue-300/45",
        text: "text-blue-50",
        beam: "from-blue-100 via-blue-500 to-transparent",
        ring: "border-blue-300/45",
      },
      description: "Theo dõi lịch sống, nhắc việc, thói quen và các quyết định cần ưu tiên.",
    },
    {
      id: "finance",
      label: "Tài chính",
      value: "Ngân sách",
      Icon: Wallet,
      tone: {
        card: "border-emerald-200/45 bg-emerald-400/10 shadow-emerald-950/30",
        orb: "from-emerald-100 via-teal-400 to-cyan-700 shadow-emerald-300/45",
        text: "text-emerald-50",
        beam: "from-emerald-100 via-teal-400 to-transparent",
        ring: "border-emerald-200/45",
      },
      description: "Quản lý thu nhập, hũ tiền, chi tiêu và ngân sách theo mục tiêu sống.",
    },
  ];
  const activeNodeData = systemNodes.find((node) => node.id === activeNode);
  const particles = [
    ["left-[8%] top-[22%] h-1.5 w-1.5 bg-cyan-200/80", "authTwinkle 3.8s ease-in-out 0s infinite"],
    ["left-[19%] top-[42%] h-1 w-1 bg-cyan-300/70", "authTwinkle 4.6s ease-in-out .7s infinite"],
    ["left-[31%] top-[18%] h-1.5 w-1.5 bg-sky-300/60", "authTwinkle 5.2s ease-in-out .2s infinite"],
    ["left-[48%] top-[28%] h-1 w-1 bg-blue-200/70", "authTwinkle 4.2s ease-in-out 1s infinite"],
    ["left-[67%] top-[20%] h-1.5 w-1.5 bg-blue-200/70", "authTwinkle 4.8s ease-in-out .4s infinite"],
    ["left-[84%] top-[38%] h-1 w-1 bg-emerald-100/80", "authTwinkle 3.9s ease-in-out .9s infinite"],
    ["left-[92%] top-[62%] h-1.5 w-1.5 bg-teal-100/75", "authTwinkle 5s ease-in-out .1s infinite"],
    ["left-[12%] bottom-[22%] h-2 w-2 bg-cyan-300/60", "authTwinkle 4.4s ease-in-out .5s infinite"],
  ];

  return (
    <aside className="relative min-h-[360px] overflow-hidden bg-[linear-gradient(135deg,#31e957_0%,#10dccf_48%,#0d86e8_100%)] px-8 py-10 text-white lg:min-h-screen lg:px-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.24),transparent_26%),radial-gradient(circle_at_86%_10%,rgba(255,255,255,0.16),transparent_30%),linear-gradient(180deg,rgba(0,68,58,0.08),rgba(0,29,64,0.18))]" />
      <div className="relative z-10 flex h-full max-w-[680px] flex-col">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/45 bg-white/16 shadow-lg shadow-emerald-950/10">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <p className="text-base font-black">MagerLife</p>
        </div>

        <div className="mt-10">
          <h1 className="max-w-[640px] text-[2rem] font-black leading-[1.16] text-white">
            Người bạn đồng hành cho cuộc sống cân bằng hơn mỗi ngày
          </h1>
          <p className="mt-5 max-w-[640px] text-[15px] font-medium leading-7 text-white/92">
            Mỗi lựa chọn về tiền, sức khỏe, hành vi và lịch sống đều tác động lẫn nhau. MagerLife giúp bạn nhìn các mối liên kết đó rõ hơn trước khi ra quyết định.
          </p>
        </div>

        <div className="mt-7 space-y-5">
          {storyPoints.map(([Icon, title, description]) => (
            <div key={title as string} className="flex gap-4">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-white" />
              <div>
                <p className="text-[15px] font-black leading-6 text-white">{title as string}</p>
                <p className="mt-1 max-w-[600px] text-sm font-medium leading-6 text-white/84">{description as string}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 max-w-[680px]">
          <div
            className="relative overflow-visible rounded-[30px] border border-white/28 bg-cyan-950/18 p-3 shadow-2xl shadow-emerald-950/20 backdrop-blur-xl"
            onMouseLeave={() => setActiveNode(null)}
          >
            <div className="absolute inset-0 overflow-hidden rounded-[30px]">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/28 via-cyan-700/18 to-blue-700/26 blur-3xl" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_6%_72%,rgba(6,95,70,0.3),transparent_18%),radial-gradient(circle_at_92%_16%,rgba(30,64,175,0.24),transparent_22%),linear-gradient(180deg,rgba(15,118,110,0.14),rgba(8,47,73,0.3))]" />
            </div>
            {particles.map(([className, animation], index) => (
              <span key={index} className={`absolute rounded-full shadow-[0_0_18px_currentColor] ${className}`} style={{ animation }} />
            ))}
            <div className="absolute left-[-8%] top-[34%] h-20 w-[58%] rotate-[-18deg] rounded-[50%] border border-emerald-100/36 border-r-transparent border-t-transparent" />
            <div className="absolute right-[-12%] bottom-[26%] h-[72px] w-[56%] rotate-[-10deg] rounded-[50%] border border-blue-100/32 border-l-transparent border-b-transparent" />
            <div className="absolute inset-x-8 bottom-5 h-11 rounded-[50%] border border-cyan-100/18 bg-cyan-100/8" />
            <div className="relative grid grid-cols-4 gap-3 pt-11">
                {systemNodes.map((node, index) => {
                  const isActive = activeNode === node.id;
                  const isDimmed = Boolean(activeNode && !isActive);
                  const NodeIcon = node.Icon;
                  return (
                    <div
                      key={node.id}
                      className={`min-w-0 transition-[z-index] duration-300 ${isActive ? "relative z-30" : "relative z-10"}`}
                      style={{ animation: `authFloat 4s ease-in-out ${index * 0.3}s infinite` }}
                    >
                      <button
                      key={node.id}
                      type="button"
                      onMouseEnter={() => setActiveNode(node.id)}
                      title={node.description}
                      className={`group relative flex h-[205px] w-full min-w-0 flex-col items-center justify-center rounded-[24px] border border-white/34 bg-cyan-950/24 px-2 text-center shadow-xl shadow-emerald-950/18 backdrop-blur-xl transition-all duration-500 ${
                        isActive
                          ? "-translate-y-3 scale-[1.025] border-white/70 bg-cyan-950/34 shadow-2xl z-30"
                          : "hover:-translate-y-3 hover:scale-[1.025] hover:bg-cyan-950/30"
                      } ${isDimmed ? "opacity-58 saturate-75" : "opacity-100"}`}
                    >
                      <div className={`absolute bottom-4 left-1/2 h-10 w-8 -translate-x-1/2 bg-gradient-to-t ${node.tone.beam} opacity-18 blur-xl transition-all duration-300 ${isActive ? "h-16 opacity-34" : ""}`} />
                      <div className={`absolute -top-8 z-40 flex h-16 w-16 items-center justify-center rounded-full border border-white/45 bg-gradient-to-br ${node.tone.orb} text-white shadow-[0_0_46px_rgba(34,211,238,0.62)] backdrop-blur-xl transition-all duration-300 ${
                        isActive ? "scale-110 shadow-[0_0_82px_rgba(255,255,255,0.74)]" : "group-hover:scale-105 group-hover:shadow-[0_0_76px_rgba(255,255,255,0.62)]"
                      }`}>
                        <div className={`absolute -inset-4 rounded-full border border-white/12 opacity-0 transition-opacity duration-300 ${isActive ? "opacity-100" : "group-hover:opacity-80"}`} />
                        <div className={`absolute -inset-6 rotate-[-18deg] rounded-[50%] border border-white/0 border-t-white/35 opacity-0 transition-opacity duration-300 ${isActive ? "opacity-100" : "group-hover:opacity-70"}`} />
                        <div className="absolute left-3 top-3 h-3 w-6 rotate-[-24deg] rounded-full bg-white/70 blur-[1px]" />
                        <NodeIcon className="relative h-7 w-7" />
                      </div>
                      <h3 className="mt-7 text-[17px] font-black leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,42,60,0.55)]">
                        {node.label}
                      </h3>

                      <p className={`mt-3 min-h-[34px] text-[10px] font-black uppercase leading-5 tracking-wide drop-shadow-[0_1px_8px_rgba(0,42,60,0.52)] ${node.tone.text}`}>
                          {node.value}
                      </p>

                      <span className="mt-3 text-2xl font-black text-white/38">
                        0{index + 1}
                      </span>
                      </button>
                    </div>
                  );
                })}
            </div>

            <div
              className={`relative mt-5 min-h-[58px] rounded-2xl border border-white/24 bg-white/16 px-4 py-2 text-sm font-bold leading-6 text-white/92 shadow-lg shadow-emerald-950/10 backdrop-blur-md transition-all duration-300 ${
                activeNodeData ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              {activeNodeData?.description}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes authFloat {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-18px); }
            100% { transform: translateY(0px); }
          }
          @keyframes authTwinkle {
            0%, 100% { opacity: 0.28; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.25); }
          }
        `}</style>

        <div className="mt-auto pt-10 text-xs font-medium text-white/70">© 2026 MagerLife · AI Life Agent System</div>
      </div>
    </aside>
  );
}

function AuthFlow({ onComplete }: { onComplete: (profile: UserProfile) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [step, setStep] = useState<"account" | "verify" | "enrich" | "priority" | "confirm">("account");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    identifier: "",
    email: "",
    password: "",
    birthday: "",
    gender: "",
    weight: "",
    height: "",
    job: "",
    interests: "",
    salary: "",
    currency: "VND" as MoneyCurrency,
    foodMonthlyBudget: "",
    workTypes: [] as string[],
    busyness: [] as string[],
    sleepHabits: [] as string[],
    sleepQuality: [] as string[],
    activityLevels: [] as string[],
    trainingGoals: [] as string[],
    trainingFrequency: [] as string[],
    trainingDuration: [] as string[],
    trainingExperience: [] as string[],
    injuryIssues: [] as string[],
    favoriteWorkouts: [] as string[],
    nutritionGoals: [] as string[],
    eatingStyles: [] as string[],
    foodRestrictions: [] as string[],
    budgetStyles: [] as string[],
    futureGoals: [] as string[],
    currentPriority: "",
    customPriority: "",
    bodyChangeGoal: [] as string[],
    bodyFatPercent: "",
    bodyFatMass: "",
    musclePercent: "",
    muscleMass: "",
    customKcal: "",
    customKcalReason: "",
    customChoiceInputs: {} as Record<string, string>,
  });

  const passwordChecks = [
    { label: "Dài hơn 8 ký tự", valid: form.password.length > 8 },
    { label: "Có ít nhất 1 chữ cái viết hoa", valid: /[A-Z]/.test(form.password) },
    { label: "Có ít nhất 1 số", valid: /\d/.test(form.password) },
    { label: "Có ít nhất 1 ký tự đặc biệt", valid: /[^A-Za-z0-9]/.test(form.password) },
  ];
  const passwordValid = passwordChecks.every((item) => item.valid);
  const currentChoiceSections = [
    { title: "Công việc", key: "workTypes", max: 3, options: ["Học sinh / Sinh viên", "Nhân viên văn phòng", "Freelancer", "Kinh doanh tự do", "Lao động chân tay", "Làm việc theo ca", "Remote / Work from Home"] },
    { title: "Mức độ bận rộn", key: "busyness", max: 1, options: ["Nhàn rỗi", "Bình thường", "Tương đối linh hoạt", "Thời gian rất linh hoạt", "Khá bận", "Luôn bận rộn"] },
    { title: "Thói quen ngủ", key: "sleepHabits", max: 2, options: ["Thường thiếu ngủ (<6h)", "Ngủ chập chờn", "Ngủ sớm (trước 22h)", "Ngủ trung bình (22h-24h)", "Thường thức khuya (sau 24h)", "Lịch ngủ không cố định"] },
    { title: "Chất lượng giấc ngủ", key: "sleepQuality", max: 1, options: ["Rất kém", "Kém", "Bình thường", "Tốt", "Rất tốt"] },

    { title: "Mức độ vận động hàng ngày", key: "activityLevels", max: 1, options: ["Hầu hết ngồi một chỗ", "Đi lại nhẹ trong ngày", "Công việc vận động vừa phải", "Công việc vận động nhiều"] },
    { title: "Thói quen tập luyện", key: "trainingFrequency", max: 1, options: ["Không tập luyện", "1-2 buổi/tuần", "3-4 buổi/tuần", "5+ buổi/tuần"] },
    { title: "Thời gian dành cho luyện tập", key: "trainingDuration", max: 1, options: ["Dưới 30 phút/ngày", "30–60 phút/ngày", "60–90 phút/ngày", "Trên 90 phút/ngày"] },
    { title: "Kinh nghiệm tập luyện", key: "trainingExperience", max: 1, options: ["Chưa từng tập", "Mới bắt đầu", "Tập dưới 1 năm", "Tập trên 1 năm"] },
    { title: "Hình thức tập luyện yêu thích", key: "favoriteWorkouts", max: 3, options: ["Đi bộ", "Chạy bộ", "Đạp xe", "Bơi lội", "Gym", "Calisthenics", "Yoga", "Leo núi", "Thể thao đồng đội"] },
    { title: "Vấn đề chấn thương", key: "injuryIssues", max: 1, options: ["Không có", "Đau lưng", "Đau vai", "Đau gối", "Thoát vị đĩa đệm"] },

    { title: "Mục tiêu tập luyện hiện tại", key: "trainingGoals", max: 3, options: ["Giảm cân", "Giảm mỡ", "Tăng cơ", "Tăng sức mạnh", "Cải thiện sức bền", "Duy trì sức khỏe", "Tăng độ linh hoạt", "Bulking", "Cutting"] },
    { title: "Mục tiêu dinh dưỡng", key: "nutritionGoals", max: 3, options: ["Giảm cân", "Giảm mỡ", "Tăng cơ", "Duy trì cân nặng", "Ăn lành mạnh hơn", "Trải nghiệm các món ăn mới"] },
    { title: "Mục tiêu thay đổi cân nặng", key: "bodyChangeGoal", max: 1, options: ["Giảm cân", "Giữ cân", "Tăng cân"] },
    { title: "Phong cách ăn uống", key: "eatingStyles", max: 3, options: ["Bữa ăn truyền thống Việt Nam", "Ăn uống đơn giản, tiết kiệm", "Meal Prep", "Eat Clean", "Low Carb", "High Protein", "Kết hợp Chay", "Thuần chay"] },
    { title: "Hạn chế thực phẩm", key: "foodRestrictions", max: 4, options: ["Không có", "Dị ứng hải sản", "Dị ứng sữa", "Dị ứng đậu phộng", "Không ăn bò", "Không ăn heo", "Không ăn cay", "Không ăn nội tạng"] },
    { title: "Thói quen chi tiêu", key: "budgetStyles", max: 1, options: ["Rất tiết kiệm", "Tiết kiệm một phần", "Chi tiêu cân bằng", "Thoải mái tận hưởng", "Chi tiêu theo cảm xúc"] },
  ] as const;
  const futureGoalGroups = [
    { title: "Health", options: ["Giảm cân đáng kể", "Tăng cân", "Tăng cơ rõ rệt", "Duy trì lối sống khỏe mạnh"] },
    { title: "Finance", options: ["Quỹ khẩn cấp 6 tháng", "Tiết kiệm 100 triệu đầu tiên", "Tự do tài chính", "Tăng thu nhập","Mua xe", "Mua nhà"] },
    { title: "Career", options: ["Thăng chức", "Chuyển việc", "Học ngoại ngữ", "Chứng chỉ chuyên môn", "Xây dựng thương hiệu cá nhân"] },
    { title: "Lifestyle", options: ["Cân bằng công việc - cuộc sống", "Du lịch nhiều hơn", "Xây dựng thói quen tốt", "Giảm stress", "Ngủ đủ giấc", "Học kỹ năng sống mới"] },
  ] as const;

  function patchForm(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function getCustomChoiceConflict(customInputs = cleanedCustomInputs(), state = form) {
    const signals = extractCustomChoiceSignals(customInputs);
    const customText = Object.values(customInputs).join(" ");
    const bodyIntent = analyzeBodyGoalText(customText);
    const currentDirection = [...state.trainingGoals, ...state.nutritionGoals, ...state.bodyChangeGoal, ...state.futureGoals];
    const hasSelectedLoss = isWeightLossIntent(currentDirection) || state.bodyChangeGoal.includes("Giảm cân");
    const hasSelectedGain = isWeightGainIntent(currentDirection) || state.bodyChangeGoal.includes("Tăng cân") || state.futureGoals.includes("Tăng cân");
    const selectedMaintain = state.bodyChangeGoal.includes("Giữ cân") || state.nutritionGoals.includes("Duy trì cân nặng");
    const selectedMuscleGain = currentDirection.some((item) => item.includes("Tăng cơ"));
    const selectedFatLoss = currentDirection.some((item) => item.includes("Giảm mỡ"));
    const customLoss = Number(signals.custom_weight_loss) > 0 || bodyIntent.loseWeight || bodyIntent.loseFat;
    const customGain = Number(signals.custom_weight_gain) > 0 || bodyIntent.gainWeight;
    const isValidRecomposition = bodyIntent.recomposition || (bodyIntent.loseFat && bodyIntent.gainMuscle);
    if (bodyIntent.loseFat && bodyIntent.gainFat) return "Phần Khác đang vừa muốn giảm mỡ vừa muốn tăng mỡ. Hãy chọn một hướng cho mỡ.";
    if (bodyIntent.loseMuscle && bodyIntent.gainMuscle) return "Phần Khác đang vừa muốn giảm cơ vừa muốn tăng cơ. Hãy chọn một hướng cho cơ.";
    if (bodyIntent.loseWater && bodyIntent.gainWater) return "Phần Khác đang vừa muốn giảm nước vừa muốn tăng nước. Hãy chọn một hướng cho nước.";
    if (bodyIntent.loseWeight && bodyIntent.gainWeight) return "Phần Khác đang có cả giảm cân và tăng cân tổng thể. Hãy tách rõ mục tiêu chính.";
    if (selectedMaintain && (bodyIntent.loseWeight || bodyIntent.gainWeight) && !isValidRecomposition) return "Bạn đang chọn Giữ/Duy trì cân nặng, nhưng phần Khác lại ghi giảm hoặc tăng cân tổng thể.";
    if (hasSelectedLoss && bodyIntent.gainWeight && !isValidRecomposition) return "Bạn đang chọn hướng giảm cân/giảm mỡ nhưng phần Khác lại có tăng cân tổng thể.";
    if (hasSelectedGain && bodyIntent.loseWeight && !isValidRecomposition) return "Bạn đang chọn hướng tăng cân/bulking nhưng phần Khác lại có giảm cân tổng thể.";
    if (bodyIntent.gainMuscle && !selectedMuscleGain && state.bodyChangeGoal.includes("Giảm cân") && !bodyIntent.loseFat) return "Nếu muốn tăng cơ trong phần Khác, hãy chọn thêm mục Tăng cơ hoặc ghi rõ giảm mỡ + tăng cơ.";
    if (bodyIntent.loseFat && !selectedFatLoss && state.bodyChangeGoal.includes("Tăng cân") && !bodyIntent.gainMuscle) return "Nếu muốn giảm mỡ trong phần Khác, hãy chọn thêm mục Giảm mỡ hoặc ghi rõ tăng cơ + giảm mỡ.";
    if (customLoss && customGain && !isValidRecomposition) return "Phần Khác đang có cả tín hiệu giảm và tăng nhưng chưa nói rõ tăng/giảm phần nào của cơ thể.";
    return "";
  }

  function patchCustomChoice(key: string, value: string) {
    const nextInputs = { ...form.customChoiceInputs, [key]: value };
    const conflict = getCustomChoiceConflict(
      Object.fromEntries(Object.entries(nextInputs).map(([inputKey, inputValue]) => [inputKey, inputValue.trim()]).filter(([, inputValue]) => inputValue))
    );
    setError(conflict);
    setForm((prev) => ({
      ...prev,
      customChoiceInputs: nextInputs,
    }));
  }

  function getCustomChoiceText(key: string) {
    return form.customChoiceInputs[key] || "";
  }

  function patchMoney(key: "salary" | "foodMonthlyBudget", value: string) {
    const digits = value.replace(/\D/g, "");
    setForm((prev) => ({ ...prev, [key]: digits ? Number(digits).toLocaleString("vi-VN") : "" }));
  }

  function parseMoney(value: string) {
    return Number(value.replace(/\D/g, ""));
  }

  function moneyWords(value: number, currency: MoneyCurrency) {
    if (!value) return "";
    if (currency === "USD") return `${value.toLocaleString("en-US")} đô la`;
    if (value >= 1_000_000_000) {
      const billions = Math.floor(value / 1_000_000_000);
      const millions = Math.floor((value % 1_000_000_000) / 1_000_000);
      return millions ? `${billions} tỷ ${millions} triệu` : `${billions} tỷ`;
    }
    if (value >= 1_000_000) {
      const millions = Math.floor(value / 1_000_000);
      const thousands = Math.floor((value % 1_000_000) / 1_000);
      return thousands ? `${millions} triệu ${thousands} nghìn` : `${millions} triệu`;
    }
    if (value >= 1_000) return `${Math.floor(value / 1_000)} nghìn`;
    return `${value} đồng`;
  }

  function compactVndWords(value: number) {
    if (value >= 1_000_000_000) return `${Number((value / 1_000_000_000).toFixed(3))} tỷ`;
    if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))} triệu`;
    if (value >= 1_000) return `${Number((value / 1_000).toFixed(2))} nghìn`;
    return `${value} đồng`;
  }

  function isWeightLossIntent(values: string[]) {
    return values.some((item) => item.includes("Giảm cân") || item.includes("Giảm mỡ") || item === "Cutting");
  }

  function isWeightGainIntent(values: string[]) {
    return values.some((item) => item.includes("Tăng cân") || item === "Bulking");
  }

  function validateChoiceConflict(prev: typeof form, key: keyof typeof form, value: string, next: string[]) {
    const nextTrainingGoals = key === "trainingGoals" ? next : prev.trainingGoals;
    const nextNutritionGoals = key === "nutritionGoals" ? next : prev.nutritionGoals;
    const nextBodyGoals = key === "bodyChangeGoal" ? next : prev.bodyChangeGoal;
    const nextFutureGoals = key === "futureGoals" ? next : prev.futureGoals;
    const nextSleepHabits = key === "sleepHabits" ? next : prev.sleepHabits;
    const nextSleepQuality = key === "sleepQuality" ? next : prev.sleepQuality;
    const nextTrainingFrequency = key === "trainingFrequency" ? next : prev.trainingFrequency;
    const nextTrainingDuration = key === "trainingDuration" ? next : prev.trainingDuration;
    const nextTrainingExperience = key === "trainingExperience" ? next : prev.trainingExperience;
    const nextFavoriteWorkouts = key === "favoriteWorkouts" ? next : prev.favoriteWorkouts;
    const nextInjuryIssues = key === "injuryIssues" ? next : prev.injuryIssues;

    const currentDirection = [...nextTrainingGoals, ...nextNutritionGoals, ...nextBodyGoals];
    const futureLoss = nextFutureGoals.includes("Giảm cân đáng kể");
    const futureGain = nextFutureGoals.includes("Tăng cân");
    if (isWeightLossIntent(currentDirection) && futureGain) {
      return "Đang chọn hướng giảm cân/giảm mỡ thì mục tiêu 1-2 năm tới không nên chọn Tăng cân.";
    }
    if (isWeightGainIntent(currentDirection) && futureLoss) {
      return "Đang chọn hướng tăng cân/bulking thì mục tiêu 1-2 năm tới không nên chọn Giảm cân đáng kể.";
    }
    if (futureLoss && futureGain) {
      return "Mục tiêu tương lai đang mâu thuẫn: không nên chọn đồng thời Giảm cân đáng kể và Tăng cân.";
    }
    if (nextBodyGoals.includes("Giảm cân") && nextBodyGoals.includes("Tăng cân")) {
      return "Mục tiêu thay đổi cân nặng chỉ nên chọn một hướng: Giảm cân, Giữ cân hoặc Tăng cân.";
    }
    if (nextBodyGoals.includes("Giữ cân") && (nextBodyGoals.includes("Giảm cân") || nextBodyGoals.includes("Tăng cân"))) {
      return "Nếu chọn Giữ cân thì không chọn kèm Giảm cân hoặc Tăng cân trong cùng nhóm.";
    }
    if (nextNutritionGoals.includes("Duy trì cân nặng") && nextNutritionGoals.includes("Giảm cân")) {
      return "Duy trì cân nặng và Giảm cân là hai hướng khác nhau, hãy chọn một hướng chính.";
    }
    if (nextNutritionGoals.includes("Duy trì cân nặng") && (nextBodyGoals.includes("Giảm cân") || nextBodyGoals.includes("Tăng cân"))) {
      return "Nếu mục tiêu dinh dưỡng là Duy trì cân nặng thì mục tiêu thay đổi cân nặng nên là Giữ cân.";
    }
    if (nextNutritionGoals.includes("Giảm cân") && nextBodyGoals.includes("Tăng cân")) {
      return "Giảm cân và Tăng cân là hai hướng ngược nhau, hãy chọn một hướng chính.";
    }
    if (nextTrainingGoals.includes("Bulking") && (nextTrainingGoals.includes("Cutting") || nextTrainingGoals.includes("Giảm cân") || nextTrainingGoals.includes("Giảm mỡ"))) {
      return "Bulking không nên chọn cùng Cutting/Giảm cân/Giảm mỡ trong cùng giai đoạn.";
    }
    if (nextSleepHabits.includes("Ngủ chập chờn") && nextSleepQuality.some((item) => ["Bình thường", "Tốt", "Rất tốt"].includes(item))) {
      return "Nếu chọn Ngủ chập chờn, chất lượng giấc ngủ chỉ nên là Rất kém hoặc Kém.";
    }
    if (nextSleepHabits.includes("Thường thiếu ngủ (<6h)") && nextSleepQuality.some((item) => ["Tốt", "Rất tốt"].includes(item))) {
      return "Nếu thường thiếu ngủ dưới 6h, chất lượng giấc ngủ không nên đánh là Tốt hoặc Rất tốt.";
    }
    if (nextTrainingFrequency.includes("Không tập luyện") && nextTrainingDuration.length > 0) {
      return "Nếu chọn Không tập luyện thì không chọn thêm thời gian dành cho luyện tập.";
    }
    if (nextTrainingFrequency.includes("Không tập luyện") && nextFavoriteWorkouts.length > 0) {
      return "Nếu chọn Không tập luyện thì chưa nên chọn thêm hình thức tập luyện yêu thích.";
    }
    if (nextTrainingExperience.includes("Chưa từng tập") && nextTrainingFrequency.includes("5+ buổi/tuần")) {
      return "Chưa từng tập không nên bắt đầu ngay với 5+ buổi/tuần.";
    }
    const hasSevereInjury = nextInjuryIssues.includes("Thoát vị đĩa đệm") || nextInjuryIssues.includes("Đau gối") || nextInjuryIssues.includes("Đau lưng");
    if (key !== "injuryIssues" && hasSevereInjury && nextTrainingGoals.some((item) => ["Tăng sức mạnh", "Bulking"].includes(item))) {
      return "Có chấn thương lưng/gối/thoát vị thì chưa nên chọn Tăng sức mạnh hoặc Bulking làm mục tiêu chính.";
    }
    if (key !== "injuryIssues" && hasSevereInjury && nextFavoriteWorkouts.some((item) => ["Chạy bộ", "Leo núi", "Calisthenics"].includes(item))) {
      return "Có chấn thương lưng/gối/thoát vị thì nên tránh Chạy bộ, Leo núi hoặc Calisthenics cho đến khi có phương án phù hợp.";
    }
    return "";
  }

  function toggleChoice(key: keyof typeof form, value: string, max: number) {
    setError("");
    setForm((prev) => {
      const current = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
      const exists = current.includes(value);
      if (!exists && max > 1 && current.length >= max) {
        setError(`Mục "${value}" chưa được chọn vì nhóm này chỉ nên chọn tối đa ${max}.`);
        return prev;
      }
      const next = exists ? current.filter((item) => item !== value) : max === 1 ? [value] : [...current, value];
      const conflict = !exists ? validateChoiceConflict(prev, key, value, next) : "";
      if (conflict) {
        setError(conflict);
        return prev;
      }
      const patched = { ...prev, [key]: next };
      const customConflict = getCustomChoiceConflict(prev.customChoiceInputs, patched);
      if (customConflict) {
        setError(customConflict);
        return prev;
      }
      if (key === "sleepHabits" && value === "Ngủ chập chờn" && !exists) {
        return { ...patched, sleepQuality: prev.sleepQuality.some((item) => ["Rất kém", "Kém"].includes(item)) ? prev.sleepQuality : ["Kém"] };
      }
      if (key === "sleepHabits" && value === "Thường thiếu ngủ (<6h)" && !exists) {
        return { ...patched, sleepQuality: prev.sleepQuality.some((item) => ["Rất kém", "Kém", "Bình thường"].includes(item)) ? prev.sleepQuality : ["Kém"] };
      }
      if (key === "trainingFrequency" && value === "Không tập luyện" && !exists) {
        return { ...patched, trainingDuration: [], favoriteWorkouts: [] };
      }
      if (key === "nutritionGoals" && value === "Duy trì cân nặng" && !exists && !prev.bodyChangeGoal.includes("Giữ cân")) {
        return { ...patched, bodyChangeGoal: ["Giữ cân"] };
      }
      if (key === "nutritionGoals" && value === "Duy trì cân nặng" && exists) {
        return { ...patched, bodyChangeGoal: prev.bodyChangeGoal.filter((item) => item !== "Giữ cân") };
      }
      if (key === "foodRestrictions" && value === "Không có" && !exists) return { ...patched, [key]: ["Không có"] };
      if (key === "foodRestrictions" && value !== "Không có") return { ...patched, [key]: next.filter((item) => item !== "Không có") };
      if (key === "injuryIssues" && value === "Không có" && !exists) return { ...patched, [key]: ["Không có"] };
      if (key === "injuryIssues" && value !== "Không có") return { ...patched, [key]: next.filter((item) => item !== "Không có") };
      return patched;
    });
  }

  function selectedText(key: keyof typeof form) {
    const value = form[key];
    return Array.isArray(value) ? value.join(", ") : String(value || "");
  }

  function cleanedCustomInputs() {
    return Object.fromEntries(
      Object.entries(form.customChoiceInputs)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value)
    );
  }

  function customChoiceSummary(customInputs: Record<string, string>) {
    return Object.entries(customInputs)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" | ");
  }

  function extractCustomChoiceSignals(customInputs: Record<string, string>) {
    return extractSignalsFromFreeText(Object.values(customInputs).join(" "));
  }

  const priorityOptions = Array.from(new Set([
    ...form.trainingGoals,
    ...form.nutritionGoals,
    ...form.futureGoals,
    form.budgetStyles.includes("Rất tiết kiệm") || form.budgetStyles.includes("Chi tiêu cân bằng") ? "Tiết kiệm tiền" : "",
    "Tự bổ sung",
  ].filter(Boolean)));
  const currentPriority = form.currentPriority === "Tự bổ sung" ? form.customPriority.trim() : form.currentPriority;
  const priorityIntent = currentPriority.toLowerCase();
  const salaryAmount = parseMoney(form.salary);
  const foodMonthlyBudgetAmount = parseMoney(form.foodMonthlyBudget);
  const foodBudgetTooHigh = salaryAmount > 0 && foodMonthlyBudgetAmount > salaryAmount;
  const setupDaysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const starterJars = salaryAmount > 0 ? createStarterJarsForCurrency(salaryAmount, form.currency, foodMonthlyBudgetAmount) : [];
  const livingJar = starterJars.find((jar) => jar.id === "necessities" || jar.name.includes("Sinh hoạt"));
  const mealBudgetSuggestion = livingJar
    ? `Theo hũ Sinh hoạt: ${formatCurrency(livingJar.monthlyAllocation, form.currency)}/tháng`
    : "Cần lương để tính theo hũ Sinh hoạt";
  const mealBudgetSuggestionForConfirm = foodMonthlyBudgetAmount > 0
    ? `${formatCurrency(foodMonthlyBudgetAmount, form.currency)}/tháng. Trung bình: ${formatCurrency(foodMonthlyBudgetAmount / setupDaysInMonth, form.currency)}/ngày`
    : "Chưa thiết lập ngân sách ăn/tháng";
  const todayDate = new Date();
  const selectedBirthday = form.birthday ? new Date(form.birthday) : null;
  const birthdayInFuture = Boolean(selectedBirthday && selectedBirthday.getTime() > todayDate.getTime());
  const age = selectedBirthday && !birthdayInFuture ? Math.max(0, todayDate.getFullYear() - selectedBirthday.getFullYear()) : 0;
  const weightKg = Number(form.weight);
  const heightCm = Number(form.height);
  const bodyFatPercent = Number(form.bodyFatPercent);
  const bodyFatMass = Number(form.bodyFatMass);
  const musclePercent = Number(form.musclePercent);
  const muscleMass = Number(form.muscleMass);
  const customKcal = Number(form.customKcal);
  const activityMultiplier =
    form.activityLevels.includes("Công việc vận động nhiều") || form.trainingFrequency.includes("5+ buổi/tuần")
      ? 1.725
      : form.activityLevels.includes("Công việc vận động vừa phải") || form.trainingFrequency.includes("3-4 buổi/tuần")
        ? 1.55
        : form.activityLevels.includes("Đi lại nhẹ trong ngày") || form.trainingFrequency.includes("1-2 buổi/tuần")
          ? 1.375
          : 1.2;
  const mifflinBmr =
    weightKg > 0 && heightCm > 0 && age > 0
      ? Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (form.gender === "Nữ" ? -161 : 5))
      : 0;
  const katchBmr =
    weightKg > 0 && Number.isFinite(bodyFatPercent) && bodyFatPercent > 0 && bodyFatPercent < 70
      ? Math.round(370 + 21.6 * (weightKg * (1 - bodyFatPercent / 100)))
      : 0;
  const bmr = katchBmr || mifflinBmr;
  const tdee = bmr ? Math.round(bmr * activityMultiplier) : 0;
  const hasRequiredKcalProfile = Boolean(form.birthday && !birthdayInFuture && age > 0 && form.gender && Number(form.weight) > 0 && Number(form.height) > 0);
  const bodyGoal = form.bodyChangeGoal[0] || (form.trainingGoals.includes("Tăng cơ") ? "Tăng cơ" : "Giữ cân");
  const wantsFatLoss =
    form.bodyChangeGoal.includes("Giảm mỡ") ||
    form.nutritionGoals.includes("Giảm mỡ") ||
    form.trainingGoals.includes("Giảm mỡ") ||
    form.nutritionGoals.includes("Giảm cân") ||
    form.trainingGoals.includes("Giảm cân");
  const wantsMuscleGain =
    form.bodyChangeGoal.includes("Tăng cơ") ||
    form.nutritionGoals.includes("Tăng cơ") ||
    form.trainingGoals.includes("Tăng cơ");
  const priorityWantsLoss = priorityIntent.includes("giảm cân") || priorityIntent.includes("giảm mỡ") || priorityIntent.includes("siết");
  const priorityWantsGain = priorityIntent.includes("tăng cân") || priorityIntent.includes("bulking");
  const wantsLoss = form.bodyChangeGoal.some((item) => item.startsWith("Giảm")) || wantsFatLoss || priorityWantsLoss;
  const wantsGain = form.bodyChangeGoal.some((item) => item.startsWith("Tăng")) || wantsMuscleGain || priorityWantsGain;
  const hasGoalConflict =
    (form.bodyChangeGoal.includes("Giảm mỡ") && form.bodyChangeGoal.includes("Tăng mỡ")) ||
    (form.bodyChangeGoal.includes("Giảm nước") && form.bodyChangeGoal.includes("Tăng nước"));
  const isRecomposition = wantsFatLoss && wantsMuscleGain && !hasGoalConflict;
  const lacksCalorieData = !tdee;
  const kcalAdjustment = lacksCalorieData
    ? isRecomposition
      ? "Giảm nhẹ 100 - 200kcal/ngày, ưu tiên protein cao"
      : wantsGain && !wantsLoss
        ? "Tăng 200 - 300kcal/ngày"
        : wantsLoss
          ? "Giảm 200 - 300kcal/ngày"
          : "Ăn gần mức duy trì"
    : isRecomposition
      ? "Giảm nhẹ 100 - 300kcal/ngày, ưu tiên protein cao"
      : wantsLoss
        ? "Giảm 300 - 500kcal/ngày"
        : wantsGain
          ? "Tăng 200 - 400kcal/ngày"
          : "Ăn gần TDEE duy trì";
  const suggestedKcal = tdee;
  const selectedGoalSummary = Array.from(new Set([
    ...form.nutritionGoals,
    ...form.bodyChangeGoal,
    ...form.trainingGoals,
    ...form.futureGoals,
  ].filter(Boolean))).join(", ");
  const goalGroups = {
    nutrition: selectedText("nutritionGoals"),
    bodyChange: selectedText("bodyChangeGoal"),
    training: selectedText("trainingGoals"),
    future: selectedText("futureGoals"),
  };
  const systemSuggestion = [
    wantsLoss ? `Giảm cân/giảm mỡ: ${kcalAdjustment}.` : "",
    wantsMuscleGain ? "Tăng cơ: ưu tiên protein cao và luyện tập đều." : "",
    wantsMuscleGain && !wantsFatLoss ? "Chỉ tăng kcal khi cân nặng hoặc hiệu suất tập không cải thiện." : "",
  ].filter(Boolean).join(" ");
  const kcalDelta = customKcal > 0 && tdee ? customKcal - tdee : 0;
  const kcalDeltaLarge = Math.abs(kcalDelta) > Math.max(300, tdee * 0.15);
  const bodyFatMassExpected = weightKg > 0 && bodyFatPercent > 0 ? (weightKg * bodyFatPercent) / 100 : 0;
  const muscleMassExpected = weightKg > 0 && musclePercent > 0 ? (weightKg * musclePercent) / 100 : 0;
  const bodyCompositionWarnings = [
    bodyFatMass > 0 && bodyFatMassExpected > 0 && Math.abs(bodyFatMass - bodyFatMassExpected) > 2 ? "Khối lượng mỡ và % mỡ đang lệch hơn 2kg." : "",
    muscleMass > 0 && muscleMassExpected > 0 && Math.abs(muscleMass - muscleMassExpected) > 2 ? "Khối lượng cơ và % cơ đang lệch hơn 2kg." : "",
    bodyFatPercent > 0 && musclePercent > 0 && bodyFatPercent + musclePercent > 100 ? "Tổng % cơ và % mỡ đang vượt 100%." : "",
  ].filter(Boolean);
  const dietModeSuggestion = [
    form.eatingStyles.includes("High Protein") || form.trainingGoals.includes("Tăng cơ") ? "High Protein" : "",
    form.eatingStyles.includes("Meal Prep") || form.budgetStyles.includes("Rất tiết kiệm") ? "Meal Prep" : "",
    form.eatingStyles.includes("Ăn đơn giản, tiết kiệm") ? "Ăn đơn giản, tiết kiệm" : "",
  ].filter(Boolean).join(" + ") || "Ăn truyền thống Việt Nam có kiểm soát";
  const currentCustomSignals = extractCustomChoiceSignals(cleanedCustomInputs());
  const currentSignalChips = profileSignalChips(currentCustomSignals);
  const preferenceWeights = {
    "finance.saving": Number(currentCustomSignals.custom_budget_pressure) > 0 ? 0.9 : form.budgetStyles.includes("Rất tiết kiệm") ? 0.9 : form.budgetStyles.includes("Chi tiêu cân bằng") ? 0.65 : 0.35,
    "finance.flexible_spending": form.budgetStyles.includes("Thoải mái tận hưởng") ? 0.8 : form.budgetStyles.includes("Chi tiêu theo cảm xúc") ? 0.7 : 0.35,
    "health.fat_loss": Number(currentCustomSignals.custom_weight_loss) > 0 || form.bodyChangeGoal.includes("Giảm cân") || form.trainingGoals.includes("Giảm mỡ") ? 0.9 : 0.2,
    "health.muscle_gain": Number(currentCustomSignals.custom_muscle_gain) > 0 || Number(currentCustomSignals.custom_high_protein) > 0 || form.trainingGoals.includes("Tăng cơ") ? 0.9 : 0.2,
    "nutrition.high_protein": Number(currentCustomSignals.custom_muscle_gain) > 0 || Number(currentCustomSignals.custom_high_protein) > 0 || form.eatingStyles.includes("High Protein") || form.trainingGoals.includes("Tăng cơ") ? 0.85 : 0.35,
    "nutrition.meal_prep": form.eatingStyles.includes("Meal Prep") || form.eatingStyles.includes("Ăn đơn giản, tiết kiệm") ? 0.8 : 0.25,
    "planner.busy": Number(currentCustomSignals.custom_time_pressure) > 0 ? 0.9 : form.busyness.includes("Rất bận") ? 0.9 : form.busyness.includes("Khá bận") ? 0.7 : 0.35,
    "planner.recovery": Number(currentCustomSignals.custom_sleep_risk) > 0 || Number(currentCustomSignals.custom_stress_risk) > 0 || form.sleepHabits.includes("Thường thức khuya") || form.sleepHabits.includes("Lịch ngủ không cố định") ? 0.85 : 0.35,
  };

  function applyStoredProfile(storedProfile: UserProfile) {
    setForm((prev) => ({
      ...prev,
      identifier: storedProfile.email || prev.identifier,
      email: storedProfile.email || prev.email,
      birthday: storedProfile.birthday || "",
      gender: storedProfile.gender || "",
      weight: storedProfile.weight || "",
      height: storedProfile.height || "",
      job: storedProfile.job || "",
      interests: storedProfile.interests || "",
      salary: storedProfile.salary ? storedProfile.salary.toLocaleString("vi-VN") : prev.salary,
      currency: storedProfile.currency || prev.currency,
      foodMonthlyBudget: storedProfile.foodMonthlyBudget || storedProfile.foodDailyBudget ? (storedProfile.foodMonthlyBudget || (storedProfile.foodDailyBudget || 0) * setupDaysInMonth).toLocaleString("vi-VN") : prev.foodMonthlyBudget,
      budgetStyles: storedProfile.budgetStyle ? [storedProfile.budgetStyle] : prev.budgetStyles,
      currentPriority: storedProfile.currentPriority || prev.currentPriority,
      customChoiceInputs: storedProfile.customChoiceInputs || prev.customChoiceInputs,
    }));
  }

  async function submitAccount() {
    setError("");
    if (mode === "login") {
      if (!form.identifier.trim() || !form.password) {
        setError("Vui lòng nhập email/tên đăng nhập và mật khẩu.");
        return;
      }
      if (!passwordValid) {
        setError("Mật khẩu demo cần đạt đủ các quy định bảo mật để tiếp tục test.");
        return;
      }
      const accountKey = form.identifier.trim().toLowerCase();
      const apiLogin = await loginAccountViaApi({
        identifier: accountKey,
        password: form.password,
      });
      if (apiLogin.ok && apiLogin.data?.profile) {
        if (apiLogin.data.token) saveAuthSessionToken(apiLogin.data.token);
        const apiProfile = apiLogin.data.profile;
        applyStoredProfile(apiProfile);
        const apiHasRequiredKcalProfile = Boolean(apiProfile.birthday && apiProfile.gender && Number(apiProfile.weight) > 0 && Number(apiProfile.height) > 0);
        if (apiProfile.setupComplete && apiHasRequiredKcalProfile) {
          onComplete(apiProfile);
          return;
        }
        setError("Tài khoản này chưa đủ dữ liệu nền để tính kcal. Vui lòng bổ sung cân nặng, chiều cao và các thông tin còn thiếu.");
        setStep("enrich");
        return;
      }
      if (apiLogin.error?.code !== "NETWORK_ERROR") {
        setError("Email hoặc mật khẩu không đúng.");
        return;
      }
      const storedProfile = getAuthAccount<UserProfile>(accountKey);
      if (!storedProfile) {
        setError("Chưa tìm thấy tài khoản này. Hãy đăng ký trước để hệ thống ghi nhận hồ sơ.");
        return;
      }
      applyStoredProfile(storedProfile);
      const storedHasRequiredKcalProfile = Boolean(storedProfile.birthday && storedProfile.gender && Number(storedProfile.weight) > 0 && Number(storedProfile.height) > 0);
      if (storedProfile.setupComplete && storedHasRequiredKcalProfile) {
        onComplete(storedProfile);
        return;
      }
      setError("Tài khoản này chưa đủ dữ liệu nền để tính kcal. Vui lòng bổ sung cân nặng, chiều cao và các thông tin còn thiếu.");
      setStep("enrich");
      return;
    }

    if (!form.email.trim() || !form.birthday || !form.gender) {
      setError("Đăng ký bắt buộc có email, ngày/tháng/năm sinh và giới tính.");
      return;
    }
    if (!passwordValid) {
      setError("Mật khẩu chưa đạt đủ quy định bắt buộc.");
      return;
    }
    const accountKey = form.email.trim().toLowerCase();
    const draftProfile: UserProfile = {
      email: form.email.trim(),
      birthday: form.birthday,
      gender: form.gender,
      weight: form.weight,
      height: form.height,
      interests: form.interests,
      currency: form.currency,
      setupComplete: false,
      subscriptionPlan: "free",
      role: "user",
    };
    const apiRegister = await registerAccountViaApi({
      email: accountKey,
      password: form.password,
      profile: draftProfile,
    });
    if (apiRegister.ok && apiRegister.data?.profile) {
      if (apiRegister.data.token) saveAuthSessionToken(apiRegister.data.token);
      applyStoredProfile(apiRegister.data.profile);
      setError("");
      setStep("enrich");
      return;
    }
    if (apiRegister.error?.code !== "NETWORK_ERROR") {
      const dbHealth = await getApiDbHealth();
      const dbHint = dbHealth.ok && dbHealth.data
        ? ` DB=${dbHealth.data.driver}, pooler=${dbHealth.data.database?.pooler ? "yes" : "no"}, schema=${dbHealth.data.connection?.schemaReady ? "yes" : "no"}.`
        : ` DB health lỗi: ${dbHealth.error?.message || "không gọi được /health/db"}.`;
      setError(apiRegister.error?.code === "HTTP_409" || apiRegister.error?.code === "ACCOUNT_EXISTS"
        ? "Email này đã được đăng ký."
        : `Chưa thể đăng ký tài khoản qua API: ${apiRegister.error?.message || apiRegister.error?.code || "Không rõ lỗi"}.${dbHint}`);
      return;
    }
    if (!isLocalBrowserHost()) {
      setError(`Không gọi được API tại ${MAGERLIFE_API_BASE_URL}. Kiểm tra Vercel env VITE_MAGERLIFE_API_BASE_URL=/api rồi Redeploy.`);
      return;
    }
    saveAuthAccount<UserProfile>(accountKey, draftProfile);
    setError("");
    setStep("enrich");
  }

  async function finishSetup() {
    const customConflict = getCustomChoiceConflict();
    if (customConflict) {
      setError(customConflict);
      return;
    }
    const monthlyIncome = parseMoney(form.salary);
    const monthlyFoodBudget = parseMoney(form.foodMonthlyBudget);
    const customInputs = cleanedCustomInputs();
    const customSummary = customChoiceSummary(customInputs);
    const extractedSignals = extractCustomChoiceSignals(customInputs);
    const completedProfile: UserProfile = {
      email: form.email || form.identifier || "demo@magerlife.local",
      birthday: form.birthday || "1998-01-01",
      gender: form.gender || "Chưa cập nhật",
      weight: form.weight,
      height: form.height,
      job: form.job,
      interests: form.interests,
      salary: Number.isFinite(monthlyIncome) && monthlyIncome > 0 ? monthlyIncome : salary,
      currency: form.currency,
      foodMonthlyBudget: Number.isFinite(monthlyFoodBudget) && monthlyFoodBudget > 0 ? monthlyFoodBudget : undefined,
      healthGoal: form.trainingGoals.includes("Tăng cơ") ? "gain" : form.trainingGoals.some((item) => item.includes("Giảm")) ? "lose" : "maintain",
      lifestyle: [
        selectedText("workTypes"),
        selectedText("busyness"),
        selectedText("sleepHabits"),
        selectedText("sleepQuality"),
        selectedText("activityLevels"),
        customInputs.workTypes,
        customInputs.busyness,
        customInputs.sleepHabits,
        customInputs.sleepQuality,
        customInputs.activityLevels,
      ].filter(Boolean).join(" | "),
      trainingHabit: [
        selectedText("trainingGoals"),
        selectedText("trainingFrequency"),
        selectedText("trainingDuration"),
        selectedText("trainingExperience"),
        selectedText("injuryIssues"),
        selectedText("favoriteWorkouts"),
        customInputs.trainingGoals,
        customInputs.trainingFrequency,
        customInputs.trainingDuration,
        customInputs.trainingExperience,
        customInputs.injuryIssues,
        customInputs.favoriteWorkouts,
      ].filter(Boolean).join(" | "),
      dietPreference: [
        selectedText("nutritionGoals"),
        selectedText("bodyChangeGoal"),
        selectedText("eatingStyles"),
        selectedText("foodRestrictions"),
        selectedText("futureGoals"),
        customInputs.nutritionGoals,
        customInputs.bodyChangeGoal,
        customInputs.eatingStyles,
        customInputs.foodRestrictions,
        customInputs["futureGoals.Health"],
        customInputs["futureGoals.Finance"],
        customInputs["futureGoals.Career"],
        customInputs["futureGoals.Lifestyle"],
      ].filter(Boolean).join(" | "),
      budgetStyle: selectedText("budgetStyles"),
      currentPriority,
      goalSummary: selectedGoalSummary,
      goalGroups,
      kcalRecommendation: kcalAdjustment,
      systemSuggestion,
      supportStyle: "",
      calorieNote: tdee
        ? `BMR ${bmr} kcal, TDEE duy trì ${tdee} kcal, hướng kcal gợi ý: ${kcalAdjustment} cho mục tiêu ${bodyGoal}.${customKcal > 0 ? ` Người dùng tự nhập ${customKcal} kcal/ngày.` : ""}`
        : "",
      preferenceWeights,
      customChoiceInputs: customInputs,
      customChoiceSummary: customSummary,
      extractedSignals,
      subscriptionPlan: "free",
      role: "user",
      setupComplete: true,
    };
    const apiSave = await saveProfileToApi({
      userId: completedProfile.email,
      patch: completedProfile,
    });
    const nextProfile = apiSave.ok && apiSave.data?.profile ? apiSave.data.profile : completedProfile;
    saveAuthAccount<UserProfile>(nextProfile.email, nextProfile);
    onComplete(nextProfile);
  }

  const decorMode: AuthDecorMode = step === "account" ? mode : step === "verify" ? "register" : step;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[620px_1fr]">
        <AuthStoryPanel />
        <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10 md:px-10">
        <SeasonalDecor mode={decorMode} />
          <div className={`relative z-10 ${step === "account" ? "w-full max-w-lg" : "w-full max-w-3xl"} transition-all`}>
            {step === "account" && (
              <>
                <div className="mb-8 flex justify-center">
                  <div className="rounded-full bg-white p-1 shadow-sm">
                  {(["register", "login"] as const).map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setMode(item);
                        setError("");
                      }}
                      className={`h-10 rounded-full px-7 text-sm font-bold transition-colors ${mode === item ? "bg-slate-950 text-white shadow-lg shadow-slate-300/60" : "text-slate-500 hover:text-slate-900"}`}
                    >
                      {item === "register" ? "Đăng ký" : "Đăng nhập"}
                    </button>
                  ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {mode === "login" ? (
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-xs font-semibold text-slate-500">Email hoặc tên đăng nhập tự do</span>
                      <input value={form.identifier} onChange={(event) => patchForm("identifier", event.target.value)} placeholder="Email hoặc username" className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                    </label>
                  ) : (
                    <>
                      <label className="space-y-1.5 md:col-span-2">
                        <span className="text-xs font-semibold text-slate-500">Email (Bắt buộc)</span>
                        <input type="email" value={form.email} onChange={(event) => patchForm("email", event.target.value)} placeholder="you@example.com" className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold text-slate-500">Tháng/Ngày/Năm sinh</span>
                        <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthday} onChange={(event) => patchForm("birthday", event.target.value)} className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold text-slate-500">Giới tính</span>
                        <select value={form.gender} onChange={(event) => patchForm("gender", event.target.value)} className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400">
                          <option value="">Chọn giới tính</option>
                          <option>Nam</option>
                          <option>Nữ</option>
                          <option>Khác</option>
                          <option>Không muốn nói</option>
                        </select>
                      </label>
                    </>
                  )}

                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs font-semibold text-slate-500">Mật khẩu</span>
                    <input type="password" value={form.password} onChange={(event) => patchForm("password", event.target.value)} placeholder="Tạo mật khẩu..." className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                  </label>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {passwordChecks.map((rule) => (
                    <div key={rule.label} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${rule.valid ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      {rule.valid ? "✓" : "○"} {rule.label}
                    </div>
                  ))}
                </div>

                {mode === "register" && (
                  <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Cân nặng(Kg) - (Không bắt buộc)</span>
                      <input type="number" value={form.weight} onChange={(event) => patchForm("weight", event.target.value)} placeholder="VD: 72" className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Chiều cao(cm) - (Không bắt buộc)</span>
                      <input type="number" value={form.height} onChange={(event) => patchForm("height", event.target.value)} placeholder="VD: 173" className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400" />
                    </label>
                    <label className="space-y-1.5 md:col-span-2">
                      <span className="text-xs font-semibold text-slate-500">Nội dung quan tâm trên mạng xã hội (Không bắt buộc)</span>
                      <textarea
                        value={form.interests}
                        onChange={(event) => patchForm("interests", event.target.value)}
                        placeholder="AI, tài chính, gym, thời tiết, luật giao thông..."
                        rows={3}
                        className="min-h-[96px] w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400"
                      />
                    </label>
                  </div>
                )}

                {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
                <button onClick={submitAccount} className="mt-6 h-12 w-full rounded-full bg-emerald-500 px-5 text-sm font-bold text-white shadow-xl shadow-emerald-200 hover:bg-emerald-600">
                  {mode === "register" ? "Tiếp tục xác minh" : "Đăng nhập"}
                </button>
                <p className="mt-5 text-center text-sm text-slate-400">
                  {mode === "register" ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
                  <button onClick={() => setMode(mode === "register" ? "login" : "register")} className="font-black text-emerald-600">
                    {mode === "register" ? "Đăng nhập" : "Đăng ký ngay"}
                  </button>
                </p>
              </>
            )}

            {step === "verify" && (
              <>
                <Mono className="text-emerald-700">Xác minh thông tin</Mono>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Kiểm tra lại thông tin đăng ký</h2>
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    ["Email", form.email],
                    ["Ngày sinh", form.birthday],
                    ["Giới tính", form.gender],
                    ["Cân nặng", form.weight ? `${form.weight}kg` : "Sẽ hỏi sau"],
                    ["Chiều cao", form.height ? `${form.height}cm` : "Sẽ hỏi sau"],
                    ["Nội dung quan tâm", form.interests || "Tự học theo tương tác"],
                  ].map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-400">{key}</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex gap-2">
                  <button onClick={() => setStep("account")} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Sửa lại</button>
                  <button onClick={() => setStep("enrich")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Thông tin bổ sung</button>
                </div>
              </>
            )}

            {step === "enrich" && (
              <>
                <Mono className="text-emerald-700">Bổ sung dữ liệu hệ thống</Mono>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Thiết lập dữ liệu để MagerLife ra quyết định</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">Lương là dữ liệu quan trọng để chia hũ. Cân nặng, chiều cao, chế độ sinh hoạt và ăn uống là dữ liệu nên có để tính Kcal, thực đơn nấu ăn và lịch tập luyện, sinh hoạt.</p>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1.5 rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-sm shadow-emerald-100">
                    <span className="text-xs font-bold text-emerald-800">Lương/tháng</span>
                    <input inputMode="numeric" value={form.salary} onChange={(event) => patchMoney("salary", event.target.value)} placeholder="VD: 5.000.000" className="w-full rounded-xl border-2 border-emerald-300 bg-emerald-50/70 px-3 py-3 text-sm font-semibold text-slate-900 outline-none shadow-inner shadow-emerald-100/60 transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100" />
                    {parseMoney(form.salary) > 0 && (
                      <div className="space-y-0.5 text-xs leading-relaxed text-slate-500">
                        <p>Hệ thống hiểu là {moneyWords(parseMoney(form.salary), form.currency)}.</p>
                        {form.currency === "USD" && (
                          <p>
                            Khoảng {formatCurrency(parseMoney(form.salary) * usdToVndRate, "VND")} quy đổi sang VNĐ ({compactVndWords(parseMoney(form.salary) * usdToVndRate)}).
                          </p>
                        )}
                      </div>
                    )}
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-500">Loại tiền</span>
                    <select value={form.currency} onChange={(event) => patchForm("currency", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                      <option value="VND">Đồng Việt Nam (đ)</option>
                      <option value="USD">Đô la Mỹ ($)</option>
                    </select>
                    <p className="text-xs leading-relaxed text-slate-500">Free: nếu nhập khác loại tiền đã chọn, hệ thống sẽ yêu cầu tự quy đổi. Premium: hỗ trợ quy đổi theo tỷ giá thời gian thực.</p>
                  </label>
                </div>

                <div className={`mt-4 rounded-2xl border-2 bg-gradient-to-br p-4 shadow-sm ${foodBudgetTooHigh ? "border-rose-300 from-rose-50 via-amber-50 to-rose-50 shadow-rose-100" : "border-amber-300 from-amber-50 via-orange-50 to-emerald-50 shadow-amber-100"}`}>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-amber-800">Bạn muốn ăn uống khoảng bao nhiêu tiền/tháng?</span>
                    <input
                      inputMode="numeric"
                      value={form.foodMonthlyBudget}
                      onChange={(event) => patchMoney("foodMonthlyBudget", event.target.value)}
                      placeholder={form.currency === "USD" ? "VD: 250" : "VD: 3.500.000"}
                      className="w-full rounded-xl border-2 border-amber-300 bg-amber-50/80 px-3 py-3 text-sm font-semibold text-slate-900 outline-none shadow-inner shadow-amber-100/60 transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                    />
                  </label>
                  <div className="mt-2 text-xs leading-relaxed text-slate-500">
                    {foodMonthlyBudgetAmount > 0 ? (
                      foodBudgetTooHigh ? (
                        <p className="font-bold text-rose-700">
                          Ngân sách ăn uống đang vượt lương/tháng. Hãy giảm xuống tối đa {formatCurrency(salaryAmount, form.currency)} hoặc cập nhật lại thu nhập trước khi tiếp tục.
                        </p>
                      ) : (
                        <p>
                          Hệ thống sẽ dùng ngân sách {formatCurrency(foodMonthlyBudgetAmount, form.currency)}/tháng. Trung bình: {formatCurrency(foodMonthlyBudgetAmount / setupDaysInMonth, form.currency)}/ngày trong tháng này.
                        </p>
                      )
                    ) : (
                      <p>Dữ liệu này dùng để Meal Agent và hũ tiền không gợi ý vượt ngân sách ăn uống theo tháng của bạn.</p>
                    )}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Mono className="text-emerald-700">Kcal gợi ý</Mono>
                      <h3 className="mt-1 text-base font-bold text-slate-900">BMR / TDEE theo dữ liệu cơ thể</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">TDEE là mức kcal duy trì ước tính. Mục tiêu giảm/tăng sẽ chỉ tạo khuyến nghị ăn thấp hơn hoặc cao hơn TDEE theo khoảng an toàn.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-900">{tdee ? tdee.toLocaleString("vi-VN") : "--"}</p>
                      <Mono className="text-slate-500">TDEE duy trì</Mono>
                    </div>
                  </div>
                  {tdee > 0 && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-white/70 p-3 text-xs leading-relaxed text-emerald-800">
                      Khuyến nghị theo mục tiêu hiện tại: {kcalAdjustment}. Đây là gợi ý, cần theo dõi cân nặng, hiệu suất tập và sức khỏe thực tế.
                    </div>
                  )}
                  {birthdayInFuture && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-relaxed text-rose-700">
                      Ngày sinh đang ở tương lai nên hệ thống chưa thể tính tuổi, BMR và TDEE. Hãy chọn ngày sinh trước hôm nay.
                    </div>
                  )}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Ngày sinh (Bắt buộc)</span>
                      <input type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthday} onChange={(event) => patchForm("birthday", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Giới tính (Bắt buộc)</span>
                      <select value={form.gender} onChange={(event) => patchForm("gender", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="">Chọn giới tính</option>
                        <option>Nam</option>
                        <option>Nữ</option>
                        <option>Khác</option>
                        <option>Không muốn nói</option>
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Cân nặng(Kg) (Bắt buộc)</span>
                      <input type="number" value={form.weight} onChange={(event) => patchForm("weight", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Chiều cao(cm) (Bắt buộc)</span>
                      <input type="number" value={form.height} onChange={(event) => patchForm("height", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">% mỡ</span>
                      <input type="number" value={form.bodyFatPercent} onChange={(event) => patchForm("bodyFatPercent", event.target.value)} placeholder="VD: 22" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Khối lượng mỡ (Kg)</span>
                      <input type="number" value={form.bodyFatMass} onChange={(event) => patchForm("bodyFatMass", event.target.value)} placeholder="VD: 15.8" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">% cơ</span>
                      <input type="number" value={form.musclePercent} onChange={(event) => patchForm("musclePercent", event.target.value)} placeholder="VD: 38" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Khối lượng cơ (Kg)</span>
                      <input type="number" value={form.muscleMass} onChange={(event) => patchForm("muscleMass", event.target.value)} placeholder="VD: 27.5" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Kcal tự nhập</span>
                      <input type="number" value={form.customKcal} onChange={(event) => patchForm("customKcal", event.target.value)} placeholder="VD: 2100" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-slate-500">Lý do kcal đổi</span>
                      <input value={form.customKcalReason} onChange={(event) => patchForm("customKcalReason", event.target.value)} placeholder="VD: đo InBody / app khác" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
                    {[
                      ["BMR đang dùng", bmr ? `${bmr.toLocaleString("vi-VN")} kcal` : "Thiếu dữ liệu"],
                      ["Công thức", katchBmr ? "Katch-McArdle" : "Mifflin-St Jeor"],
                      ["TDEE duy trì", tdee ? `${tdee.toLocaleString("vi-VN")} kcal` : "Thiếu dữ liệu"],
                      ["Hệ số R", activityMultiplier.toString()],
                    ].map(([key, value]) => (
                      <div key={key} className="rounded-lg border border-white/80 bg-white/70 p-3">
                        <p className="text-[11px] font-bold uppercase text-slate-400">{key}</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
                      </div>
                    ))}
                  </div>

                  {(kcalDeltaLarge || bodyCompositionWarnings.length > 0) && (
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                      {kcalDeltaLarge && <p>Kcal tự nhập đang lệch {Math.abs(kcalDelta).toLocaleString("vi-VN")} kcal so với TDEE. Hãy kiểm tra lại cân nặng, chiều cao, mức vận động hoặc lý do thay đổi.</p>}
                      {bodyCompositionWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                    </div>
                  )}
                  {hasGoalConflict && (
                    <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-relaxed text-rose-700">
                      Mục tiêu đang mâu thuẫn: giảm và tăng cùng một loại như mỡ hoặc nước không nên đi chung.
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-5">
                  <div>
                    <Mono className="text-slate-500">Chế độ hiện tại</Mono>
                    <p className="mt-1 text-xs text-slate-500">Khuyến nghị chọn 2-3 mục quan trọng nhất trong mỗi nhóm hiện tại.</p>
                  </div>
                  {currentChoiceSections.map((section) => {
                    const selected = form[section.key] as string[];
                    return (
                      <div key={section.key} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-slate-900">{section.title}</p>
                          <span className="text-[11px] font-semibold text-slate-400">{selected.length}/{section.max}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {section.options.map((option) => {
                            const active = selected.includes(option);
                            return (
                              <button
                                key={option}
                                onClick={() => toggleChoice(section.key, option, section.max)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                        <textarea
                          value={getCustomChoiceText(section.key)}
                          onChange={(event) => patchCustomChoice(section.key, event.target.value)}
                          rows={2}
                          placeholder="Khác: ghi điều riêng của bạn nếu danh sách chưa đủ..."
                          className="mt-3 w-full resize-none rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white"
                        />
                      </div>
                    );
                  })}

                  <div>
                    <Mono className="text-slate-500">Mục tiêu tương lai</Mono>
                    <p className="mt-1 text-xs text-slate-500">Chọn tối đa 5 mục cho toàn bộ mục tiêu 1-2 năm tới. Mỗi nhóm chỉ hiển thị số mục đã chọn trong nhóm đó.</p>
                  </div>
                  {futureGoalGroups.map((group) => {
                    const selected = form.futureGoals;
                    const selectedInGroup = group.options.filter((option) => selected.includes(option));
                    return (
                      <div key={group.title} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-slate-900">{group.title}</p>
                          <span className="text-[11px] font-semibold text-slate-400">{selectedInGroup.length}/{group.options.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.options.map((option) => {
                            const active = selected.includes(option);
                            return (
                              <button
                                key={option}
                                onClick={() => toggleChoice("futureGoals", option, 5)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                        <textarea
                          value={getCustomChoiceText(`futureGoals.${group.title}`)}
                          onChange={(event) => patchCustomChoice(`futureGoals.${group.title}`, event.target.value)}
                          rows={2}
                          placeholder="Khác: mục tiêu riêng trong nhóm này..."
                          className="mt-3 w-full resize-none rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
                  Nếu thiếu dữ liệu, hệ thống sẽ nhắc bổ sung sau: cân nặng, chiều cao, nghề nghiệp, nội dung quan tâm, tiền thuê nhà, điện nước, lịch trình, mức stress, giấc ngủ và mục tiêu cá nhân.
                </div>
                {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
                <button
                  onClick={() => {
                    if (foodBudgetTooHigh) {
                      setError("Ngân sách ăn uống/tháng đang lớn hơn lương/tháng. Hãy giảm ngân sách ăn hoặc cập nhật lại lương trước khi tiếp tục.");
                      return;
                    }
                    if (!hasRequiredKcalProfile) {
                      setError("Vui lòng bổ sung ngày sinh, giới tính, cân nặng và chiều cao để hệ thống tính BMR/TDEE trước khi chọn ưu tiên.");
                      return;
                    }
                    const customConflict = getCustomChoiceConflict();
                    if (customConflict) {
                      setError(customConflict);
                      return;
                    }
                    setError("");
                    setStep("priority");
                  }}
                  className="mt-5 h-10 rounded-lg bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Chọn ưu tiên số 1
                </button>
              </>
            )}

            {step === "priority" && (
              <>
                <Mono className="text-emerald-700">Ưu tiên hiện tại</Mono>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Mục tiêu nào là ưu tiên số 1 hiện tại?</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">MagerLife sẽ dùng lựa chọn này để cân bằng trade-off giữa tài chính, bữa ăn, lịch tập và planner.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {priorityOptions.map((option) => {
                    const active = form.currentPriority === option;
                    return (
                      <button
                        key={option}
                        onClick={() => patchForm("currentPriority", option)}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${active ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {form.currentPriority === "Tự bổ sung" && (
                  <label className="mt-4 block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-500">Ưu tiên tự bổ sung</span>
                    <input value={form.customPriority} onChange={(event) => patchForm("customPriority", event.target.value)} placeholder="VD: Giảm stress nhưng vẫn tiết kiệm" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
                  </label>
                )}
                {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
                <div className="mt-5 flex gap-2">
                  <button onClick={() => setStep("enrich")} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Quay lại</button>
                  <button
                    onClick={() => {
                      if (!currentPriority) {
                        setError("Hãy chọn hoặc tự bổ sung một ưu tiên số 1 hiện tại.");
                        return;
                      }
                      setError("");
                      setStep("confirm");
                    }}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Xem Kế hoạch đề xuất
                  </button>
                </div>
              </>
            )}

            {step === "confirm" && (
              <>
                <Mono className="text-emerald-700">AI hiểu tôi</Mono>
                <h2 className="mt-1 text-xl font-bold text-slate-900">Dựa trên lựa chọn của bạn</h2>
                <div className="mt-5 space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  {[
                    ["Ưu tiên hiện tại", currentPriority || "Chưa chọn"],
                    ["Budget Style", selectedText("budgetStyles") || "Chi tiêu cân bằng"],
                    ["Ngân sách ăn uống đề xuất", mealBudgetSuggestionForConfirm],
                    ["TDEE duy trì", tdee ? `${tdee.toLocaleString("vi-VN")} kcal/ngày` : "Cần cân nặng, chiều cao, ngày sinh và giới tính"],
                    ["Khuyến nghị kcal", tdee ? kcalAdjustment : "Cần cân nặng, chiều cao, ngày sinh và giới tính"],
                    ["Chế độ phù hợp", dietModeSuggestion],
                  ].map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between gap-4 text-sm">
                      <span className="font-semibold text-emerald-800">{key}</span>
                      <span className="max-w-[60%] text-right font-bold text-slate-900">{value}</span>
                    </div>
                  ))}
                </div>
                {currentSignalChips.length > 0 && (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Mono className="text-blue-600">Tín hiệu từ phần Khác</Mono>
                        <p className="mt-1 text-sm font-bold text-slate-900">Hệ thống đã trích xuất để đưa vào profile</p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-600">{currentSignalChips.length} tín hiệu</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {currentSignalChips.map((signal) => (
                        <span key={signal.key} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                          {signal.label}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      Các tín hiệu này sẽ ảnh hưởng nhẹ đến gợi ý bữa ăn, lịch tập, planner và trọng số quyết định của Agent.
                    </p>
                  </div>
                )}
                <p className="mt-4 text-sm leading-relaxed text-slate-500">Bạn có muốn MagerLife sử dụng Kế hoạch này để khởi tạo dashboard, hũ tiền, meal recommendation và planner ban đầu không?</p>
                <div className="mt-5 flex gap-2">
                  <button onClick={() => setStep("priority")} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">Sửa ưu tiên</button>
                  <button onClick={finishSetup} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sử dụng Kế hoạch này</button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Header({ tab, setTab, profile }: { tab: Tab; setTab: (tab: Tab) => void; profile: UserProfile | null }) {
  const foodTabNeedsPro = profile?.role !== "admin" && profile?.subscriptionPlan !== "pro";
  const [apiHealth, setApiHealth] = useState<{
    status: "checking" | "online" | "offline";
    label: string;
  }>({ status: "checking", label: "API..." });
  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: "dashboard", label: "Dashboard", icon: Gauge },
    { id: "finance", label: "Hũ", icon: Wallet },
    { id: "onboarding", label: "Bổ sung dữ liệu", icon: MessageSquare },
    { id: "account", label: "Tài khoản", icon: Settings },
    ...(profile?.role === "admin" ? [{ id: "admin" as Tab, label: "Admin", icon: Gauge }] : []),
    { id: "food-admin", label: "Kho món", icon: Database },
    { id: "brain", label: "My Brain", icon: Shield },
    { id: "routing", label: "Routing", icon: Route },
  ];

  async function refreshApiHealth() {
    setApiHealth((prev) => ({ ...prev, status: "checking", label: "API..." }));
    const result = await getApiHealth();
    if (result.ok && result.data?.ok) {
      setApiHealth({
        status: "online",
        label: result.data.llmConfigured ? `${result.data.provider} · ${result.data.model || "model"}` : "API mock",
      });
      return;
    }
    setApiHealth({ status: "offline", label: "API offline" });
  }

  useEffect(() => {
    void refreshApiHealth();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/70 bg-white/50 backdrop-blur-2xl">
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-300/70">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-bold text-slate-900 leading-none">MagerLife</div>
            <Mono className="text-emerald-700">AI Life Agent System</Mono>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((item) => {
            const active = item.id === tab;
            const displayLabel = item.id === "food-admin" && profile?.role === "admin" ? "Kho Admin" : item.label;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {displayLabel}
                {item.id === "food-admin" && foodTabNeedsPro && <Crown className="h-3.5 w-3.5 text-amber-400" />}
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void refreshApiHealth()}
          className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-black transition ${
            apiHealth.status === "online"
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : apiHealth.status === "offline"
                ? "border-rose-100 bg-rose-50 text-rose-700"
                : "border-slate-100 bg-white/70 text-slate-500"
          }`}
          title="Kiểm tra API server"
        >
          <span className={`h-2 w-2 rounded-full ${apiHealth.status === "online" ? "bg-emerald-500" : apiHealth.status === "offline" ? "bg-rose-500" : "bg-amber-400"}`} />
          <Bot className="h-3.5 w-3.5" />
          {apiHealth.label}
        </button>
      </div>
    </header>
  );
}

function StateEngine({ insights }: { insights: ReturnType<typeof buildDashboardInsights> }) {
  const metrics = [
    { label: "Life Score", value: insights.lifeScore, icon: Battery, tone: "bg-emerald-500", text: `${insights.lifeScore}%` },
    { label: "Health", value: insights.healthScore, icon: Activity, tone: "bg-blue-500", text: `${insights.healthScore}%` },
    { label: "Finance", value: insights.financeScore, icon: DollarSign, tone: "bg-violet-500", text: `${insights.financeScore}%` },
    { label: "Living jar used", value: insights.livingUsedRatio, icon: Moon, tone: "bg-amber-400", text: `${insights.livingUsedRatio}%` },
  ];

  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Mono className="text-emerald-700">User State Engine</Mono>
          <h2 className="text-base font-bold text-slate-900">Current state</h2>
        </div>
        <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-emerald-600" />
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <metric.icon className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600">{metric.label}</span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-800">{metric.text}</span>
            </div>
            <Progress value={metric.value} tone={metric.tone} />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed text-amber-800">
          Ưu tiên hiện tại: {insights.priority}. Decision Engine đang cân bằng giữa ngân sách, kcal và hũ sinh hoạt.
        </p>
      </div>
    </Glass>
  );
}

function AgentMesh() {
  return (
    <Glass className="p-4">
      <Mono className="text-emerald-700">Agent Mesh</Mono>
      <h2 className="text-base font-bold text-slate-900 mb-3">Coordination</h2>
      <div className="space-y-2">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center gap-3 rounded-lg border border-white/70 bg-white/55 p-3">
            <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <agent.icon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-800 truncate">{agent.name}</p>
                <Mono className="text-slate-400">{agent.status}</Mono>
              </div>
              <p className="text-xs text-slate-500 truncate">{agent.signal}</p>
            </div>
          </div>
        ))}
      </div>
    </Glass>
  );
}


function AgentDecisionPanel({ insights }: { insights: ReturnType<typeof buildDashboardInsights> }) {
  return (
    <Glass className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Mono className="text-emerald-700">Agent Decision Layer</Mono>
          <h2 className="mt-1 text-base font-bold text-slate-900">Quyết định nội bộ</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Rule engine tự chấm điểm trước; API chỉ dùng để diễn giải khi cần.</p>
        </div>
        <Brain className="h-5 w-5 text-emerald-500" />
      </div>
      {insights.profileSignals.length > 0 && (
        <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Profile signals</p>
            <span className="text-[11px] font-black text-emerald-600">{insights.profileSignals.length}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {insights.profileSignals.map((signal) => (
              <span key={signal.key} className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                {signal.label}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-3">
        {insights.agentDecisions.map((decision) => {
          const DecisionIcon = decision.icon;
          return (
            <div key={decision.agent} className="rounded-xl border border-white/80 bg-white/70 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <DecisionIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900">{decision.agent}</p>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">{decision.score}%</span>
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{decision.decision}</p>
                  <p className="mt-1 text-[11px] font-mono text-slate-400">{decision.route}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${decision.apiCalled ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>
                      {decision.apiCalled ? "API/LLM called" : "Local rules"}
                    </span>
                    {decision.rulesFired.slice(0, 4).map((rule) => (
                      <span key={rule} className="rounded-full border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">
                        {rule}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {decision.factors.map((factor) => (
                  <div key={factor.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>{factor.label}</span>
                      <span>{factor.value}%</span>
                    </div>
                    <Progress value={factor.value} tone={factor.value > 75 ? "bg-emerald-500" : factor.value > 55 ? "bg-amber-400" : "bg-rose-400"} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Glass>
  );
}

function DailyBrief({ jars, insights }: { jars: Jar[]; insights: ReturnType<typeof buildDashboardInsights> }) {
  const mainJar = jars.reduce((max, jar) => (jar.percentage > max.percentage ? jar : max), jars[0]);

  return (
    <Glass className="p-5">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-emerald-600" />
            <Mono className="text-emerald-700">Decision Engine</Mono>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Bản điều phối hôm nay</h1>
          <p className="text-xs text-slate-500 mt-1">Ưu tiên: {insights.priority} · đọc từ hũ, kcal và Kế hoạch cá nhân</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-slate-900">{insights.lifeScore}</div>
          <Mono className="text-slate-400">Life Score</Mono>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {insights.actions.map((action) => (
          <div key={action.title} className={`rounded-lg border p-3 ${action.tone}`}>
            <action.icon className="h-4 w-4 mb-2" />
            <p className="text-sm font-bold text-slate-900">{action.title}</p>
            <p className="text-xs mt-1 leading-relaxed">{action.text}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white/70 p-4">
        <div className="flex items-start gap-3">
          <Bot className="h-5 w-5 text-slate-700 shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed text-slate-700">
            Hệ thống đang hiểu bạn theo hướng: {insights.priority}. Hôm nay nên giữ chi tiêu trong vùng an toàn của hũ {mainJar?.name}, theo dõi kcal ở mức {insights.kcalAdvice}, và cập nhật chi tiêu ngay sau mỗi quyết định lớn.
          </p>
        </div>
      </div>
    </Glass>
  );
}

function MealRecommendation({
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
    const result = await sendChatTurnToApi({
      text: [
        "Hãy gợi ý món ăn thực tế cho hôm nay.",
        `Ngân sách ăn hôm nay: ${formatCurrency(insights.foodTodayCap, currency)}.`,
        `Kcal còn lại: ${insights.remainingKcalToday}/${insights.dailyKcalTarget} kcal.`,
        `Chế độ/ưu tiên: ${insights.needsHighProtein ? "ưu tiên protein cao" : "cân bằng"}, ${insights.prefersMealPrep ? "meal prep/tiết kiệm" : "ăn thường ngày"}.`,
        "Không gợi ý món vượt ngân sách. Nếu ngân sách dưới 30.000 VNĐ thì không gợi ý phở/bún/cơm phần mua ngoài.",
      ].join(" "),
      profile,
      currency,
      activeTab: "meal_recommendation",
    });
    if (result.ok && result.data?.message) {
      setApiMealAdvice(result.data.message);
      setApiMealAdviceStatus("idle");
      return;
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

function RealtimeCalendarCard({ calendar }: { calendar: ReturnType<typeof useRealtimeCalendar> }) {
  const hours = calendar.now.getHours() % 12;
  const minutes = calendar.now.getMinutes();
  const seconds = calendar.now.getSeconds();
  const hourAngle = hours * 30 + minutes * 0.5;
  const minuteAngle = minutes * 6 + seconds * 0.1;
  const secondAngle = seconds * 6;

  return (
    <Glass className="p-4">
      <div className="text-center">
        <div className="relative mx-auto h-36 w-36 overflow-hidden rounded-full bg-white shadow-xl shadow-slate-200">
          <img
            src="/images/clock-face.svg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 rounded-full bg-white/10" />
          <span className="absolute left-1/2 top-1/2 h-[30px] w-[5px] origin-bottom rounded-full bg-slate-950 shadow-sm" style={{ transform: `translate(-50%, -100%) rotate(${hourAngle}deg)`, transformOrigin: "50% 100%" }} />
          <span className="absolute left-1/2 top-1/2 h-[42px] w-[3px] origin-bottom rounded-full bg-slate-800 shadow-sm" style={{ transform: `translate(-50%, -100%) rotate(${minuteAngle}deg)`, transformOrigin: "50% 100%" }} />
          <span className="absolute left-1/2 top-1/2 h-[48px] w-[1px] origin-bottom bg-emerald-500" style={{ transform: `translate(-50%, -100%) rotate(${secondAngle}deg)`, transformOrigin: "50% 100%" }} />
          <span className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950 ring-4 ring-white shadow" />
        </div>
        <h2 className="mt-3 text-base font-bold text-slate-900">Lịch và Thời gian</h2>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-400">Đồng hồ</p>
          <p className="mt-1 text-sm font-black text-slate-900">{calendar.timeLabel}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-400">Ngày dương</p>
          <p className="mt-1 text-sm font-black text-slate-900">{calendar.solarLabel}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-400">Ngày âm</p>
          <p className="mt-1 text-sm font-black text-slate-900">{calendar.lunarLabel}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
          <p className="text-[11px] font-bold uppercase text-slate-400">Tháng này</p>
          <p className="mt-1 text-sm font-black text-slate-900">{calendar.remainingDaysIncludingToday}/{calendar.daysInMonth} ngày còn lại</p>
        </div>
      </div>
      <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold leading-relaxed ${calendar.isVegetarianDay ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white/70 text-slate-600"}`}>
        {calendar.isVegetarianDay
          ? "Hôm nay là mùng 1 hoặc 15 âm lịch. Nếu người dùng chọn ăn chay, Meal Agent sẽ ưu tiên thực đơn chay."
          : "Không phải ngày chay cố định. Có thể dùng thực đơn thường, tùy mục tiêu và ngân sách."}
      </div>
    </Glass>
  );
}

function WeatherForecastCard() {
  const weather = useWeatherPlaces();
  const manualPlaces = weather.places.filter((place) => !place.isCurrent);
  const activePlace = weather.places.find((place) => place.id === weather.activePlaceId) || weather.places[0];
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Glass className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Mono className="text-sky-700">Weather</Mono>
          <h2 className="mt-1 text-base font-bold text-slate-900">Dự báo thời tiết</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Theo vị trí hiện tại và tối đa 3 nơi bạn muốn theo dõi.</p>
        </div>
        <button
          onClick={() => setSettingsOpen((prev) => !prev)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
          title="Cài đặt thời tiết"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {settingsOpen && (
        <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/80 p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600" />
            <p className="text-xs font-semibold leading-relaxed text-sky-800">{weather.message}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={weather.requestCurrentLocation} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white">
              <Navigation className="h-3.5 w-3.5" />
              Reload vị trí
            </button>
            {activePlace && (
              <button onClick={() => void weather.reloadPlace(activePlace)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
                <CloudRain className="h-3.5 w-3.5" />
                Reload thời tiết
              </button>
            )}
          </div>
          {weather.places.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {weather.places.map((place) => (
                <div key={place.id} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      weather.setActivePlaceId(place.id);
                      setSettingsOpen(false);
                    }}
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-xs font-bold ${activePlace?.id === place.id ? "border-sky-300 bg-white text-sky-700" : "border-slate-200 bg-white/70 text-slate-600"}`}
                  >
                    <span className="block truncate">{place.name}</span>
                  </button>
                  {!place.isCurrent && (
                    <button onClick={() => weather.removePlace(place.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={weather.query}
              onChange={(event) => weather.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void weather.addManualPlace();
              }}
              placeholder="Thêm nơi khác..."
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-300"
            />
            <button onClick={() => void weather.addManualPlace()} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40" disabled={manualPlaces.length >= 3}>
              Thêm
            </button>
          </div>
        </div>
      )}

      {!activePlace && (
        <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs font-semibold leading-relaxed text-slate-500">
          Chưa có dữ liệu thời tiết. Hãy cấp quyền vị trí hoặc thêm địa điểm thủ công trong nút cài đặt.
        </div>
      )}

      {activePlace && (
        <div className="rounded-xl border border-white/80 bg-white/75 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black leading-snug text-slate-900">{activePlace.name}</p>
                {activePlace.isCurrent && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">Hiện tại</span>}
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {activePlace.status === "loading" ? "Đang cập nhật..." : activePlace.status === "error" ? activePlace.error : activePlace.weather?.summary || "Chưa có dữ liệu"}
              </p>
            </div>
          </div>

          {activePlace.weather && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  [Thermometer, "Nhiệt độ", `${activePlace.weather.temperature}°C`],
                  [Droplets, "Độ ẩm", `${activePlace.weather.humidity}%`],
                  [Umbrella, "Khả năng mưa", `${activePlace.weather.rainChance}%`],
                  [CloudRain, "Gió", `${activePlace.weather.windSpeed} km/h`],
                ].map(([Icon, label, value]) => {
                  const WeatherIcon = Icon as React.ElementType;
                  return (
                    <div key={label as string} className="rounded-lg bg-slate-50 p-2">
                      <p className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400"><WeatherIcon className="h-3 w-3" />{label as string}</p>
                      <p className="mt-0.5 text-lg font-black text-slate-900">{value as string}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-slate-100 bg-white p-2">
                {[
                  [Clock, activePlace.weather.hourly.map((hour) => hour.time), "text-slate-600"],
                  [Thermometer, activePlace.weather.hourly.map((hour) => `${hour.temperature}°`), "text-rose-600"],
                  [Umbrella, activePlace.weather.hourly.map((hour) => `${hour.rainChance}%`), "text-sky-700"],
                  [Droplets, activePlace.weather.hourly.map((hour) => `${hour.humidity}%`), "text-cyan-700"],
                ].map(([Icon, values, tone], rowIndex) => {
                  const RowIcon = Icon as React.ElementType;
                  const rowValues = values as string[];
                  return (
                    <div key={rowIndex} className="grid grid-cols-[24px_repeat(3,minmax(0,1fr))] items-center gap-2 border-b border-slate-100 py-2 last:border-b-0">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-lg bg-slate-50 ${tone as string}`}>
                        <RowIcon className="h-3.5 w-3.5" />
                      </div>
                      {rowValues.map((value, index) => (
                        <div key={`${rowIndex}-${index}`} className="rounded-lg bg-slate-50 px-2 py-1.5 text-center text-[11px] font-black text-slate-800">
                          {value}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Glass>
  );
}

function buildDashboardInsights(profile: UserProfile | null, jars: Jar[], transactions: Transaction[], currency: MoneyCurrency) {
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

const mealIconSources: Record<NutritionMealLog["meal"], string> = {
  Sáng: "",
  Trưa: "",
  Tối: "",
  Phụ: "",
};

function parseDecimalNumber(value: string) {
  return Number(value.replace(",", "."));
}

function normalizeFoodServingUnit(unit?: string): FoodServingUnit {
  return serviceNormalizeFoodServingUnit(unit);
}

function detectMealFromText(text: string): NutritionMealLog["meal"] {
  const normalized = text.toLowerCase();
  if (normalized.includes("sáng") || normalized.includes("sang") || normalized.includes("breakfast")) return "Sáng";
  if (normalized.includes("tối") || normalized.includes("toi") || normalized.includes("dinner")) return "Tối";
  if (normalized.includes("phụ") || normalized.includes("phu") || normalized.includes("snack")) return "Phụ";
  return "Trưa";
}

function extractMacroGram(text: string, keywords: string[]) {
  const escaped = keywords.map((keyword) => keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const afterNumber = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:g|gram)?\\s*(?:${escaped.join("|")})`, "i");
  const beforeNumber = new RegExp(`(?:${escaped.join("|")})\\D{0,12}(\\d+(?:[.,]\\d+)?)\\s*(?:g|gram)?`, "i");
  const match = text.match(afterNumber) || text.match(beforeNumber);
  return match?.[1] ? Math.round(parseDecimalNumber(match[1])) : undefined;
}

function extractMealPrice(text: string) {
  const normalized = text.toLowerCase();
  const match = normalized.match(/(?:giá|hết|mất|tốn|tiền)?\s*(\d[\d.,]*)\s*(k|nghìn|ngàn|đ|vnd|vnđ|đồng)\b/i);
  if (!match?.[1]) return undefined;
  const raw = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  const unit = match[2] || "";
  if (unit === "k" || unit.includes("ngh")) return Math.round(raw * 1000);
  return Math.round(raw);
}

function estimateNutritionFromFoodLibrary(text: string, profile: UserProfile | null, adminFoodLibrary: FoodLibraryItem[]) {
  if (hasEverydayServingUnit(text) && !hasExplicitNutritionUnit(text)) return null;
  return resolveNutritionFromFoodLibrary(text, [...(profile?.customFoodItems || []), ...adminFoodLibrary]);
}

function looksLikeFoodLog(text: string) {
  const normalized = text.toLowerCase();
  return /(ăn|uong|uống|bữa|sáng|trưa|tối|phụ|breakfast|lunch|dinner|snack|món|khẩu phần|suất)/i.test(normalized);
}

function parseNutritionMealFromChat(text: string, profile: UserProfile | null, adminFoodLibrary: FoodLibraryItem[]): NutritionMealLog | null {
  const kcalMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calo|calories|cal)\b/i);
  const estimated = kcalMatch?.[1] ? null : estimateNutritionFromFoodLibrary(text, profile, adminFoodLibrary);
  if (!kcalMatch?.[1] && !estimated) return null;
  const kcal = kcalMatch?.[1] ? Math.round(parseDecimalNumber(kcalMatch[1])) : estimated?.kcal || 0;
  if (!Number.isFinite(kcal) || kcal <= 0) return null;
  const cleanedName =
    estimated?.name ||
    text
      .replace(/(\d+(?:[.,]\d+)?)\s*(?:kcal|calo|calories|cal)\b/gi, "")
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|gram)?\s*(?:carb|carbs|protein|đạm|dam|béo|beo|fat|xơ|xo|fiber)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim() ||
    "Món vừa ghi";
  return {
    id: `${Date.now()}-chat-meal`,
    meal: detectMealFromText(text),
    name: cleanedName.slice(0, 64),
    kcal,
    carbs: extractMacroGram(text, ["carb", "carbs", "tinh bột", "tinh bot"]) ?? estimated?.carbs,
    protein: extractMacroGram(text, ["protein", "đạm", "dam", "chất đạm", "chat dam"]) ?? estimated?.protein,
    fat: extractMacroGram(text, ["fat", "béo", "beo", "chất béo", "chat beo"]) ?? estimated?.fat,
    fiber: extractMacroGram(text, ["fiber", "xơ", "xo", "chất xơ", "chat xo"]) ?? estimated?.fiber,
    price: extractMealPrice(text),
    createdAt: new Date().toISOString(),
  };
}

function NutritionDashboardCard({
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
  const isProPlan = profile?.subscriptionPlan === "pro";
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
    if (!isProPlan || !foodDraft.name.trim()) return;
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
    onProfileUpdate({ customFoodItems: [...customFoods, nextItem] }, `Pro custom food: ${nextItem.name}`);
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
              Pro có thể tự nhập món và thông số riêng. Khi chat đúng tên hoặc alias, hệ thống ưu tiên kho cá nhân trước kho Admin.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${isProPlan ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {isProPlan ? "Pro" : "Free khóa"}
          </span>
        </div>

        {pendingApiCount > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-700">
            {pendingApiCount} món đang chờ API/LLM ước tính vì chưa có trong kho dữ liệu.
          </div>
        )}

        <div className={`mt-4 grid gap-2 ${isProPlan ? "" : "opacity-50"}`}>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={foodDraft.name}
              disabled={!isProPlan}
              onChange={(event) => setFoodDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Tên món"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed"
            />
            <input
              value={foodDraft.aliases}
              disabled={!isProPlan}
              onChange={(event) => setFoodDraft((prev) => ({ ...prev, aliases: event.target.value }))}
              placeholder="Alias, cách gọi khác"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={foodDraft.servingGram} disabled={!isProPlan} onChange={(event) => setFoodDraft((prev) => ({ ...prev, servingGram: event.target.value }))} placeholder="Khẩu phần g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.kcalPer100g} disabled={!isProPlan} onChange={(event) => setFoodDraft((prev) => ({ ...prev, kcalPer100g: event.target.value }))} placeholder="kcal/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.proteinPer100g} disabled={!isProPlan} onChange={(event) => setFoodDraft((prev) => ({ ...prev, proteinPer100g: event.target.value }))} placeholder="đạm/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input value={foodDraft.carbsPer100g} disabled={!isProPlan} onChange={(event) => setFoodDraft((prev) => ({ ...prev, carbsPer100g: event.target.value }))} placeholder="carb/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.fatPer100g} disabled={!isProPlan} onChange={(event) => setFoodDraft((prev) => ({ ...prev, fatPer100g: event.target.value }))} placeholder="béo/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
            <input value={foodDraft.fiberPer100g} disabled={!isProPlan} onChange={(event) => setFoodDraft((prev) => ({ ...prev, fiberPer100g: event.target.value }))} placeholder="xơ/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-300 disabled:cursor-not-allowed" />
          </div>
          <button
            type="button"
            disabled={!isProPlan}
            onClick={addCustomFoodItem}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white shadow-lg shadow-slate-200 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Lưu món cá nhân
          </button>
        </div>

        {customFoods.length > 0 && (
          <div className="mt-4 space-y-2">
            {customFoods.slice(-4).map((food) => (
              <div key={food.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-black text-slate-800">{food.name}</p>
                  <p className="text-slate-500">{food.kcalPer100g} kcal/100g · {food.proteinPer100g || 0}g đạm</p>
                </div>
                <button type="button" onClick={() => deleteCustomFoodItem(food.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-white text-rose-500 hover:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ChatPanel({
  jars,
  profile,
  currency,
  adminFoodLibrary,
  onProfileUpdate,
}: {
  jars: Jar[];
  profile: UserProfile | null;
  currency: MoneyCurrency;
  adminFoodLibrary: FoodLibraryItem[];
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", text: "Mình là MagerLife. Hôm nay mình đang theo dõi tài chính, sức khỏe và lịch của bạn." },
  ]);
  const [input, setInput] = useState("");

  async function send(text = input) {
    if (!text.trim()) return;
    const result = resolveChatAgentTurn<UserProfile, NutritionMealLog>({
      text,
      jars,
      profile,
      resolveMealLog: (message) => parseNutritionMealFromChat(message, profile, adminFoodLibrary),
      looksLikeFoodLog,
      detectMealFromText,
      moneyFormatter: money,
    });
    let finalText = result.aiText;
    let finalPatch = result.profilePatch;
    let finalSourceText = result.profileSourceText || text;
    const pendingRequests = finalPatch?.pendingNutritionApiRequests || [];
    const latestPendingRequest = pendingRequests[pendingRequests.length - 1];
    if (latestPendingRequest) {
      try {
        const resolution = await resolveNutritionByApiContract(latestPendingRequest, profile);
        const firstSuggestion = resolution.suggestions[0];
        if (firstSuggestion) {
          finalText = [
            `Mình đã đưa khẩu phần này qua API/LLM để ước tính.`,
            `Gợi ý gần nhất: ${firstSuggestion.name} - khoảng ${firstSuggestion.kcal} kcal.`,
            "Mình chưa ghi vào nhật ký; hãy xác nhận candidate ở phần Calo & Dinh dưỡng nếu đúng.",
          ].join(" ");
        }
      } catch {
        finalText = `${finalText} API/LLM hiện chưa phản hồi được, request vẫn nằm trong hàng chờ xác nhận.`;
      }
    }
    const shouldTryApi = !result.profilePatch && result.aiText.includes("sau đó mới gọi LLM");
    if (shouldTryApi) {
      const apiResult = await sendChatTurnToApi({
        text,
        profile,
        currency,
      });
      if (apiResult.ok && apiResult.data?.message) {
        finalText = apiResult.data.message;
        finalPatch = apiResult.data.profilePatch as Partial<UserProfile> | undefined;
        finalSourceText = `Chat API/LLM: ${text}`;
      }
    }
    if (finalPatch && Object.keys(finalPatch).length > 0) {
      onProfileUpdate(finalPatch, finalSourceText);
    }
    setMessages((prev) => [...prev, { role: "user", text }, { role: "ai", text: finalText }]);
    setInput("");
  }

  return (
    <Glass className="h-[520px] flex flex-col">
      <div className="p-4 border-b border-white/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">MagerLife Chat</p>
            <Mono className="text-slate-400">context-aware</Mono>
          </div>
        </div>
        <Lock className="h-4 w-4 text-slate-400" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[86%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                message.role === "user" ? "bg-slate-900 text-white" : "bg-white/75 text-slate-700 border border-white/80"
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
        {quickQuestions.map((question) => (
          <button key={question} onClick={() => send(question)} className="shrink-0 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-white">
            {question}
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-white/70 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && send()}
          placeholder="Hỏi về quyết định hôm nay..."
          className="min-w-0 flex-1 rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs outline-none focus:border-emerald-400"
        />
        <button onClick={() => send()} className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </Glass>
  );
}

function FinanceView({
  jars,
  setJars,
  transactions,
  setTransactions,
  salary,
  currency,
}: {
  jars: Jar[];
  setJars: React.Dispatch<React.SetStateAction<Jar[]>>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  salary: number;
  currency: MoneyCurrency;
}) {
  const [savedJars, setSavedJars] = useState<Jar[]>(jars);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const jarEditorRef = useRef<HTMLElement | null>(null);
  const transactionFormRef = useRef<HTMLDivElement | null>(null);
  const [showConfirmRemainder, setShowConfirmRemainder] = useState(false);
  const [pendingJarDelete, setPendingJarDelete] = useState<{
    jar: Jar;
    relatedTransactions: Transaction[];
    targetJarId: string;
  } | null>(null);
  const [pendingTxDelete, setPendingTxDelete] = useState<Transaction | null>(null);
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    emoji: "💰",
    percentage: 5,
    purposeNote: "",
  });
  const [txDraft, setTxDraft] = useState({
    jarId: jars[0]?.id || "",
    type: "expense" as "expense" | "income",
    itemName: "",
    amount: "",
    spentAt: new Date().toISOString().slice(0, 16),
    note: "",
  });
  const totalPct = jars.reduce((sum, jar) => sum + jar.percentage, 0);
  const remaining = 100 - totalPct;
  const hasUnsavedChanges = JSON.stringify(jars) !== JSON.stringify(savedJars);
  const selectedJar = jars.find((jar) => jar.id === txDraft.jarId) || jars[0];
  const monthlyJarTotal = jars.reduce((sum, jar) => sum + jar.monthlyAllocation, 0);
  const primaryIncome = salary;
  const monthlySupportTotal = transactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : 0), 0);
  const monthlyTotal = primaryIncome + monthlySupportTotal;
  const pendingJarDeleteOptions = pendingJarDelete ? jars.filter((jar) => jar.id !== pendingJarDelete.jar.id) : [];
  const pendingJarExpenseTotal =
    pendingJarDelete?.relatedTransactions.reduce((sum, tx) => sum + (tx.type === "expense" ? tx.amount : 0), 0) || 0;
  const pendingJarIncomeTotal =
    pendingJarDelete?.relatedTransactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : 0), 0) || 0;
  const pendingJarNextPct = pendingJarDelete ? totalPct - pendingJarDelete.jar.percentage : totalPct;
  const pendingJarNeedsTransfer = pendingJarDelete ? pendingJarDelete.relatedTransactions.length > 0 || pendingJarDelete.jar.balance > 0 : false;
  const pendingTxDeleteJar = pendingTxDelete ? jars.find((jar) => jar.id === pendingTxDelete.jarId) : null;
  const pendingTxDeleteNextBalance =
    pendingTxDelete && pendingTxDeleteJar
      ? Math.max(0, pendingTxDeleteJar.balance + (pendingTxDelete.type === "expense" ? pendingTxDelete.amount : -pendingTxDelete.amount))
      : 0;

  function parseFinanceAmount(value: string) {
    if (currency === "USD") return Number(value.replace(/,/g, ""));
    return parseMoney(value);
  }

  function formatFinanceInput(value: string) {
    if (currency === "USD") return value.replace(/[^\d.]/g, "");
    const digits = value.replace(/\D/g, "");
    return digits ? Number(digits).toLocaleString("vi-VN") : "";
  }

  useEffect(() => {
    if (!editingId && !editingTxId) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (editingId) {
        const insideJarForm = jarEditorRef.current?.contains(target);
        const insideEditingJar = target.closest('[data-jar-edit-surface="true"]');
        const jarEditControl = target.closest('[data-jar-edit-control="true"]');
        if (!insideJarForm && !insideEditingJar && !jarEditControl) resetDraft();
      }

      if (editingTxId) {
        const insideTransactionForm = transactionFormRef.current?.contains(target);
        const insideEditingTx = target.closest('[data-tx-edit-surface="true"]');
        const txEditControl = target.closest('[data-tx-edit-control="true"]');
        if (!insideTransactionForm && !insideEditingTx && !txEditControl) cancelEditTransaction();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [editingId, editingTxId]);

  const noteState =
    totalPct === 100
      ? {
          tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
          icon: Check,
          title: "Note:",
          text: "Phân bổ hoàn hảo. Sẵn sàng lưu.",
        }
      : totalPct < 100
        ? {
            tone: "border-blue-200 bg-blue-50 text-blue-800",
            icon: Info,
            title: "Note:",
            text: `Còn thiếu ${remaining}%. Hãy thêm hũ mới hoặc chỉnh tỷ lệ cho đủ 100%.`,
          }
        : {
            tone: "border-rose-200 bg-rose-50 text-rose-800",
            icon: AlertCircle,
            title: "Note:",
            text: `Đang vượt ${Math.abs(remaining)}%. Cần chỉnh lại tỷ lệ trước khi lưu.`,
          };

  function resetDraft() {
    setDraft({ name: "", emoji: "💰", percentage: Math.max(1, Math.min(5, Math.max(remaining, 1))), purposeNote: "" });
    setEditingId(null);
  }

  function addJar() {
    if (!draft.name.trim() || draft.percentage <= 0) return;
    const currentJar = editingId ? jars.find((jar) => jar.id === editingId) : null;
    const availablePct = remaining + (currentJar?.percentage || 0);
    if (draft.percentage > availablePct) {
      setToast(`Tỷ lệ này sẽ vượt 100%. Hiện chỉ còn tối đa ${availablePct}%.`);
      return;
    }
    const monthlyAllocation = Math.round((salary * draft.percentage) / 100);
    if (editingId) {
      setJars((prev) =>
        prev.map((jar) =>
          jar.id === editingId
            ? {
                ...jar,
                name: draft.name,
                emoji: draft.emoji,
                percentage: draft.percentage,
                monthlyAllocation,
                balance: Math.min(jar.balance, monthlyAllocation),
                purposeNote: draft.purposeNote || "Chưa có ghi chú mục đích.",
              }
            : jar
        )
      );
    } else {
      const id = `${draft.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      setJars((prev) => [
        ...prev,
        {
          id,
          name: draft.name,
          emoji: draft.emoji,
          percentage: draft.percentage,
          balance: monthlyAllocation,
          monthlyAllocation,
          purposeNote: draft.purposeNote || "Chưa có ghi chú mục đích.",
          linkedGoals: [],
        },
      ]);
    }
    resetDraft();
  }

  function removeJar(id: string) {
    const jar = jars.find((item) => item.id === id);
    if (!jar) return;
    if (isFixedFoodJar(jar)) {
      setToast("Hũ Ăn uống là hũ cố định để liên kết Meal Agent, kcal và ngân sách bữa ăn. Bạn có thể đổi tên, tỷ lệ hoặc số tiền, nhưng không thể xóa.");
      return;
    }
    const relatedTransactions = transactions.filter((tx) => tx.jarId === id);
    const targetJarId = jars.find((item) => item.id !== id)?.id || "";
    setPendingJarDelete({ jar, relatedTransactions, targetJarId });
  }

  function confirmDeleteJar() {
    if (!pendingJarDelete) return;
    const { jar, relatedTransactions, targetJarId } = pendingJarDelete;
    const targetJar = jars.find((item) => item.id === targetJarId);

    if ((relatedTransactions.length > 0 || jar.balance > 0) && !targetJar) {
      setToast("Hũ này còn số dư hoặc đã có giao dịch. Hãy tạo hoặc chọn một hũ khác để chuyển trước khi xóa.");
      return;
    }

    setJars((prev) =>
      prev
        .filter((item) => item.id !== jar.id)
        .map((item) =>
          targetJar && item.id === targetJar.id
            ? {
                ...item,
                percentage: item.percentage + jar.percentage,
                monthlyAllocation: item.monthlyAllocation + jar.monthlyAllocation,
                balance: item.balance + jar.balance,
                linkedGoals: Array.from(new Set([...item.linkedGoals, ...jar.linkedGoals])),
              }
            : item
        )
    );
    setTransactions((prev) =>
      prev.flatMap((tx) => {
        if (tx.jarId !== jar.id) return [tx];
        if (!targetJar) return [];
        return [
          {
            ...tx,
            jarId: targetJar.id,
            note: tx.note ? `${tx.note} · chuyển từ hũ ${jar.name}` : `Chuyển từ hũ ${jar.name}`,
          },
        ];
      })
    );
    if (editingId === jar.id) resetDraft();
    if (relatedTransactions.some((tx) => tx.id === editingTxId)) cancelEditTransaction();
    if (txDraft.jarId === jar.id) {
      setTxDraft((prev) => ({ ...prev, jarId: targetJar?.id || jars.find((item) => item.id !== jar.id)?.id || "" }));
    }
    setPendingJarDelete(null);
    setToast(
      (relatedTransactions.length > 0 || jar.balance > 0) && targetJar
        ? `Đã gộp hũ ${jar.name} vào ${targetJar.name}: chuyển ${jar.percentage}%, ${formatCurrency(jar.balance, currency)} còn lại và ${relatedTransactions.length} giao dịch.`
        : `Đã xóa hũ ${jar.name}. Hãy chỉnh lại ${jar.percentage}% phân bổ còn thiếu trước khi lưu.`
    );
  }

  function editJar(jar: Jar) {
    setEditingId(jar.id);
    setDraft({
      name: jar.name,
      emoji: jar.emoji,
      percentage: jar.percentage,
      purposeNote: jar.purposeNote,
    });
  }

  function saveChanges() {
    if (totalPct > 100) {
      setToast(`Không thể lưu vì tổng tỷ lệ đang vượt ${totalPct - 100}%.`);
      return;
    }
    if (totalPct < 100) {
      setShowConfirmRemainder(true);
      return;
    }
    setSavedJars(jars);
    setToast("Đã lưu thông tin hũ.");
  }

  function saveWithRemainderJar() {
    const remainderPct = 100 - totalPct;
    if (remainderPct <= 0) return;
    const monthlyAllocation = Math.round((salary * remainderPct) / 100);
    const nextJars = [
      ...jars,
      {
        id: `remainder-${Date.now()}`,
        name: "Tiền thừa",
        emoji: "💵",
        percentage: remainderPct,
        balance: monthlyAllocation,
        monthlyAllocation,
        purposeNote: "Phần % chưa phân bổ, được hệ thống tự tạo.",
        linkedGoals: ["Tự động tạo"],
      },
    ];
    setJars(nextJars);
    setSavedJars(nextJars);
    setShowConfirmRemainder(false);
    setToast(`Đã tạo hũ Tiền thừa ${remainderPct}% và lưu cấu hình.`);
  }

  function addTransaction() {
    const amount = parseFinanceAmount(txDraft.amount);
    if (!txDraft.jarId || !txDraft.itemName.trim() || !txDraft.spentAt || !Number.isFinite(amount) || amount <= 0) {
      setToast("Vui lòng nhập đủ hũ, tên sản phẩm/dịch vụ, số tiền và thời gian.");
      return;
    }

    const jar = jars.find((item) => item.id === txDraft.jarId);
    if (!jar) {
      setToast("Không tìm thấy hũ đã chọn.");
      return;
    }

    const editingTx = editingTxId ? transactions.find((tx) => tx.id === editingTxId) : null;
    const targetJarBalance = jar.balance + (editingTx?.jarId === txDraft.jarId ? (editingTx.type === "expense" ? editingTx.amount : -editingTx.amount) : 0);

    if (txDraft.type === "expense" && amount > targetJarBalance) {
      setToast(`Hũ ${jar.name} không đủ số dư để ghi chi ${formatCurrency(amount, currency)}.`);
      return;
    }

    const tx: Transaction = {
      id: editingTxId || `tx-${Date.now()}`,
      jarId: txDraft.jarId,
      type: txDraft.type,
      amount,
      itemName: txDraft.itemName.trim(),
      spentAt: txDraft.spentAt,
      note: txDraft.note.trim(),
    };

    setTransactions((prev) => (editingTxId ? prev.map((item) => (item.id === editingTxId ? tx : item)) : [tx, ...prev]));
    setJars((prev) =>
      prev.map((item) => {
        let nextBalance = item.balance;
        let nextAllocation = item.monthlyAllocation;
        if (editingTx && item.id === editingTx.jarId) {
          nextBalance += editingTx.type === "expense" ? editingTx.amount : -editingTx.amount;
          if (editingTx.type === "income") nextAllocation = Math.max(0, nextAllocation - editingTx.amount);
        }
        if (item.id === txDraft.jarId) {
          nextBalance += txDraft.type === "expense" ? -amount : amount;
          if (txDraft.type === "income") nextAllocation += amount;
        }
        return { ...item, balance: Math.max(0, nextBalance), monthlyAllocation: nextAllocation };
      })
    );
    setTxDraft((prev) => ({ ...prev, itemName: "", amount: "", note: "", spentAt: new Date().toISOString().slice(0, 16) }));
    setEditingTxId(null);
    setToast(editingTxId ? "Đã cập nhật giao dịch và số dư hũ." : txDraft.type === "expense" ? "Đã ghi chi và trừ số dư hũ." : "Đã ghi thu và cộng vào số dư hũ.");
  }

  function editTransaction(tx: Transaction) {
    setEditingTxId(tx.id);
    setTxDraft({
      jarId: tx.jarId,
      type: tx.type,
      itemName: tx.itemName,
      amount: currency === "USD" ? String(tx.amount) : Math.round(tx.amount).toLocaleString("vi-VN"),
      spentAt: tx.spentAt,
      note: tx.note,
    });
  }

  function cancelEditTransaction() {
    setEditingTxId(null);
    setTxDraft((prev) => ({ ...prev, itemName: "", amount: "", note: "", spentAt: new Date().toISOString().slice(0, 16) }));
  }

  function requestDeleteTransaction(tx: Transaction) {
    setPendingTxDelete(tx);
  }

  function confirmDeleteTransaction() {
    if (!pendingTxDelete) return;
    const tx = pendingTxDelete;
    setTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    setJars((prev) =>
      prev.map((jar) =>
        jar.id === tx.jarId
          ? {
              ...jar,
              balance: Math.max(0, jar.balance + (tx.type === "expense" ? tx.amount : -tx.amount)),
              monthlyAllocation: tx.type === "income" ? Math.max(0, jar.monthlyAllocation - tx.amount) : jar.monthlyAllocation,
            }
          : jar
      )
    );
    if (editingTxId === tx.id) cancelEditTransaction();
    setPendingTxDelete(null);
    setToast("Đã xóa giao dịch và cập nhật lại số dư hũ.");
  }

  return (
    <main className="p-4 grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
      <Glass className="p-5 xl:sticky xl:top-20 xl:self-start">
        <div ref={jarEditorRef}>
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-4 w-4 text-emerald-600" />
          <div>
            <Mono className="text-emerald-700">Custom Jar Manager</Mono>
            <h1 className="text-lg font-bold text-slate-900">Cấu trúc hũ</h1>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white/75 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tổng tiền cả tháng</p>
                <p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(monthlyTotal, currency)}</p>
              </div>
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[11px] font-bold uppercase text-emerald-700">Thu nhập chính</p>
                <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(primaryIncome, currency)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">Chu cấp thêm</p>
                <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(monthlySupportTotal, currency)}</p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Chu cấp thêm được tính từ tổng các giao dịch Thu trong danh sách chi tiêu.</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white/70 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">Đã phân bổ</span>
            <span className={`text-sm font-bold ${totalPct === 100 ? "text-emerald-700" : "text-amber-600"}`}>{totalPct}%</span>
          </div>
          <Progress value={totalPct} tone={totalPct === 100 ? "bg-emerald-500" : "bg-amber-400"} />
          <p className="text-xs text-slate-500 mt-2">{totalPct === 100 ? "Sẵn sàng dùng cho Decision Engine." : `Còn ${remaining}% chưa phân bổ.`}</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-[72px_1fr] gap-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Icon</span>
              <input value={draft.emoji} onChange={(event) => setDraft((prev) => ({ ...prev, emoji: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Tên hũ</span>
              <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="VD: Sinh hoạt, Đầu tư..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Phần trăm lượng tiền (%)</span>
            <input
              type="number"
              min={1}
              max={100}
              value={draft.percentage}
              onChange={(event) => setDraft((prev) => ({ ...prev, percentage: Number(event.target.value) }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Ghi chú mục đích cho AI</span>
            <textarea
              value={draft.purposeNote}
              onChange={(event) => setDraft((prev) => ({ ...prev, purposeNote: event.target.value }))}
              placeholder="Mô tả mục đích sử dụng hũ này để AI hiểu và ra quyết định chính xác hơn..."
              rows={7}
              className="min-h-[136px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none"
            />
          </label>
          <button onClick={addJar} disabled={!editingId && remaining <= 0} className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
            <Plus className="h-4 w-4" />
            {editingId ? "Cập nhật hũ" : "Thêm hũ"}
          </button>
          {editingId && (
            <button onClick={resetDraft} className="w-full h-9 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600">
              Hủy chỉnh sửa
            </button>
          )}
          <div className={`rounded-2xl border p-4 ${noteState.tone}`}>
            <div className="flex items-start gap-2">
              <noteState.icon className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">{noteState.title}</p>
                <p className="text-xs leading-relaxed mt-1">{noteState.text}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 shadow-sm">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Gợi ý cấu trúc hũ</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Nên có một hũ <b>Ăn uống</b> chiếm tỷ lệ cao nhất để kiểm soát bữa ăn hằng ngày, một hũ <b>Sức khỏe</b> cho gym/khám/thực phẩm hỗ trợ, một hũ <b>Tiết kiệm</b> để giữ an toàn dòng tiền và một hũ <b>Đầu tư</b> cho mục tiêu dài hạn.
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </Glass>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {jars.map((jar) => {
          const used = jar.monthlyAllocation > 0 ? Math.round((jar.balance / jar.monthlyAllocation) * 100) : 0;
          const isEditingThisJar = editingId === jar.id;
          const dimWhileEditing = Boolean(editingId) && !isEditingThisJar;
          const fixedFoodJar = isFixedFoodJar(jar);
          return (
            <Glass
              key={jar.id}
              data-jar-edit-surface={isEditingThisJar ? "true" : undefined}
              className={`p-5 transition-all duration-200 hover:-translate-y-2 hover:scale-[1.015] hover:border-emerald-300 hover:shadow-[0_22px_46px_rgba(15,23,42,0.18)] ${
                isEditingThisJar ? "relative z-10 ring-2 ring-emerald-400 bg-white scale-[1.02] shadow-[0_24px_52px_rgba(16,185,129,0.22)]" : ""
              } ${dimWhileEditing ? "opacity-35 brightness-75 grayscale bg-slate-900/20" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-xl">{jar.emoji}</div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{jar.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                        {jar.percentage}%
                      </span>
                      <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-black text-slate-700">
                        {formatCurrency(jar.monthlyAllocation, currency)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button data-jar-edit-control="true" onClick={() => editJar(jar)} className="h-8 w-8 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 flex items-center justify-center" title="Chỉnh sửa hũ">
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeJar(jar.id)}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center ${fixedFoodJar ? "cursor-not-allowed text-slate-300" : "hover:bg-rose-50 text-slate-400 hover:text-rose-500"}`}
                    title={fixedFoodJar ? "Hũ Ăn uống là hũ cố định, không thể xóa" : "Xóa hũ"}
                    aria-disabled={fixedFoodJar}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <Progress value={used} tone={used < 30 ? "bg-rose-400" : "bg-emerald-500"} />
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">{formatCurrency(jar.balance, currency)} còn</span>
                <span className="text-slate-400">{used}%</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600 mt-3">{jar.purposeNote}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {jar.linkedGoals.map((goal) => (
                  <span key={goal} className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{goal}</span>
                ))}
              </div>
            </Glass>
          );
        })}
        <Glass className="p-5 lg:col-span-2">
          <div ref={transactionFormRef}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <Mono className="text-emerald-700">Free Manual Logging</Mono>
              <h2 className="text-lg font-bold text-slate-900">Danh sách chi tiêu</h2>
              <p className="text-xs text-slate-500 mt-1">Bản Free: tự nhập giao dịch, MagerLife tự cập nhật số dư hũ.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[150px_1fr_150px_190px] gap-3 mb-3">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Loại giao dịch</span>
              <select value={txDraft.type} onChange={(event) => setTxDraft((prev) => ({ ...prev, type: event.target.value as "expense" | "income" }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                <option value="expense">Chi tiêu</option>
                <option value="income">Thu nhập</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Chọn hũ liên kết</span>
              <select value={txDraft.jarId} onChange={(event) => setTxDraft((prev) => ({ ...prev, jarId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                {jars.map((jar) => (
                  <option key={jar.id} value={jar.id}>{jar.emoji} {jar.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Số tiền</span>
              <input inputMode="decimal" value={txDraft.amount} onChange={(event) => setTxDraft((prev) => ({ ...prev, amount: formatFinanceInput(event.target.value) }))} placeholder={currency === "USD" ? "VD: 120.50" : "VD: 52.000"} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Thời gian</span>
              <input type="datetime-local" value={txDraft.spentAt} onChange={(event) => setTxDraft((prev) => ({ ...prev, spentAt: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_140px] gap-3 mb-5">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Tên sản phẩm/dịch vụ chi tiêu</span>
              <input value={txDraft.itemName} onChange={(event) => setTxDraft((prev) => ({ ...prev, itemName: event.target.value }))} placeholder="VD: Bữa trưa, tiền điện, khóa học..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Ghi chú</span>
              <input value={txDraft.note} onChange={(event) => setTxDraft((prev) => ({ ...prev, note: event.target.value }))} placeholder="VD: liên quan meal plan, chi cố định, phát sinh..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <button onClick={addTransaction} className="self-end h-10 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
              {editingTxId ? "Cập nhật" : "Ghi giao dịch"}
            </button>
          </div>
          {editingTxId && (
            <button onClick={cancelEditTransaction} className="mb-5 h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Hủy sửa giao dịch
            </button>
          )}
          </div>

          <div className="hidden lg:grid grid-cols-[88px_1.4fr_56px_1fr_165px_150px_78px] gap-3 px-5 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <span className="text-center">Loại</span>
            <span>Sản phẩm / dịch vụ</span>
            <span className="text-center">Icon</span>
            <span className="text-center">Tên hũ</span>
            <span className="text-center">Thời gian</span>
            <span className="text-right">Số tiền</span>
            <span className="text-center">Sửa</span>
          </div>

          <div className="space-y-5">
            {transactions.map((tx, index) => {
              const jar = jars.find((item) => item.id === tx.jarId);
              const isExpense = tx.type === "expense";
              const isEditingThisTx = editingTxId === tx.id;
              const dimWhileEditingTx = Boolean(editingTxId) && !isEditingThisTx;
              return (
                <div
                  key={tx.id}
                  data-tx-edit-surface={isEditingThisTx ? "true" : undefined}
                  className={`grid grid-cols-1 lg:grid-cols-[88px_1.4fr_56px_1fr_165px_150px_78px] items-center gap-3 rounded-3xl border p-4 lg:p-5 transition-all duration-200 hover:-translate-y-1 hover:scale-[1.006] hover:shadow-[8px_12px_0_rgba(15,23,42,0.78)] ${
                    isEditingThisTx
                      ? "relative z-10 border-emerald-500 bg-white scale-[1.015] shadow-[0_24px_52px_rgba(16,185,129,0.25)]"
                      : index % 2 === 0
                        ? "border-slate-900 bg-white shadow-[6px_8px_0_rgba(15,23,42,0.88)]"
                        : "border-slate-900 bg-[#fff4df] shadow-[6px_8px_0_rgba(15,23,42,0.88)]"
                  } ${dimWhileEditingTx ? "opacity-30 brightness-50 grayscale bg-slate-900/30" : ""}`}
                >
                  <div className="flex justify-center">
                    <span className={`inline-flex min-w-[64px] justify-center rounded-2xl border px-3 py-2 text-sm font-black ${isExpense ? "border-[#ff7f7f] bg-[#FFCBCB] text-[#7f1010]" : "border-[#65e9b6] bg-[#9BFFD8] text-[#065f46]"}`}>
                      {isExpense ? "Chi" : "Thu"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-950 truncate">{tx.itemName}</p>
                    {tx.note && <p className="mt-1 text-xs font-semibold text-slate-500 truncate">{tx.note}</p>}
                  </div>
                  <div className="flex justify-center">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200 text-lg shadow-sm">
                      {jar?.emoji || "?"}
                    </span>
                  </div>
                  <div className="text-center text-sm font-black text-slate-800 truncate">
                    {jar?.name || "Hũ đã xóa"}
                  </div>
                  <div className="text-center text-xs font-semibold text-slate-400">
                    {new Date(tx.spentAt).toLocaleString("vi-VN")}
                  </div>
                  <div className={`text-left lg:text-right text-base font-black ${isExpense ? "text-[#d12d2d]" : "text-[#047857]"}`}>
                    {isExpense ? "-" : "+"}{formatCurrency(tx.amount, currency)}
                  </div>
                  <div className="flex justify-center gap-1">
                    <button data-tx-edit-control="true" onClick={() => editTransaction(tx)} className="h-8 w-8 rounded-xl bg-white/80 border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center" title="Sửa giao dịch">
                      <Settings className="h-4 w-4" />
                    </button>
                    <button onClick={() => requestDeleteTransaction(tx)} className="h-8 w-8 rounded-xl bg-white/80 border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" title="Xóa giao dịch">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Glass>
      </div>
      {hasUnsavedChanges && (
        <button onClick={saveChanges} className="fixed bottom-5 right-5 z-50 h-12 rounded-2xl bg-slate-900 px-5 text-sm font-bold text-white shadow-2xl shadow-slate-400/60 flex items-center gap-2 hover:bg-slate-800">
          <Save className="h-4 w-4" />
          Lưu thay đổi
        </button>
      )}
      {toast && (
        <div className="fixed bottom-20 right-5 z-50 max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="flex-1">{toast}</span>
            <button onClick={() => setToast("")} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {pendingTxDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Mono className="text-rose-600">Xóa giao dịch</Mono>
                <h3 className="text-lg font-bold text-slate-900">Xóa “{pendingTxDelete.itemName}”?</h3>
              </div>
              <button onClick={() => setPendingTxDelete(null)} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Hũ liên kết</span>
                <span className="font-bold text-slate-900">{pendingTxDeleteJar?.name || "Hũ đã xóa"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Số tiền</span>
                <span className={`font-black ${pendingTxDelete.type === "expense" ? "text-rose-600" : "text-emerald-700"}`}>
                  {pendingTxDelete.type === "expense" ? "-" : "+"}{formatCurrency(pendingTxDelete.amount, currency)}
                </span>
              </div>
              {pendingTxDeleteJar && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Số dư sau khi xóa</span>
                  <span className="font-bold text-slate-900">{formatCurrency(pendingTxDeleteNextBalance, currency)}</span>
                </div>
              )}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Giao dịch sẽ bị xóa khỏi danh sách và số dư hũ liên kết sẽ được cập nhật lại.
            </p>

            <div className="mt-5 flex gap-2">
              <button onClick={() => setPendingTxDelete(null)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">
                Giữ lại
              </button>
              <button onClick={confirmDeleteTransaction} className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white">
                Xóa giao dịch
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingJarDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Mono className="text-rose-600">Xóa hũ</Mono>
                <h3 className="text-lg font-bold text-slate-900">
                  Xóa hũ {pendingJarDelete.jar.emoji} {pendingJarDelete.jar.name}?
                </h3>
              </div>
              <button onClick={() => setPendingJarDelete(null)} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Tỷ lệ</p>
                <p className="mt-1 text-sm font-black text-slate-900">{pendingJarDelete.jar.percentage}%</p>
                <p className="mt-1 text-xs text-slate-500">Sau khi xóa còn {pendingJarNextPct}%.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Giao dịch</p>
                <p className="mt-1 text-sm font-black text-slate-900">{pendingJarDelete.relatedTransactions.length}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Chi {formatCurrency(pendingJarExpenseTotal, currency)} · Thu {formatCurrency(pendingJarIncomeTotal, currency)}.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Số dư còn</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatCurrency(pendingJarDelete.jar.balance, currency)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Sẽ chuyển sang hũ nhận.</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">Lưu ý trước khi xóa</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                Khi chuyển sang hũ khác, MagerLife sẽ gộp cả {pendingJarDelete.jar.percentage}% phân bổ và hạn mức {formatCurrency(pendingJarDelete.jar.monthlyAllocation, currency)} để tỷ lệ còn lại không vượt 100%.
              </p>
            </div>

            {pendingJarNeedsTransfer && (
              <label className="mt-4 block space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">Chuyển số dư và lịch sử sang hũ khác</span>
                <select
                  value={pendingJarDelete.targetJarId}
                  onChange={(event) => setPendingJarDelete((prev) => (prev ? { ...prev, targetJarId: event.target.value } : prev))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                >
                  {pendingJarDeleteOptions.map((jar) => (
                    <option key={jar.id} value={jar.id}>
                      {jar.emoji} {jar.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-relaxed text-slate-500">
                  MagerLife sẽ cộng {formatCurrency(pendingJarDelete.jar.balance, currency)} còn lại, gộp {pendingJarDelete.jar.percentage}% phân bổ, giữ các giao dịch này, đổi hũ liên kết, và thêm ghi chú “chuyển từ hũ {pendingJarDelete.jar.name}”.
                </p>
              </label>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={() => setPendingJarDelete(null)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">
                Giữ lại
              </button>
              <button
                onClick={confirmDeleteJar}
                disabled={pendingJarNeedsTransfer && !pendingJarDelete.targetJarId}
                className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Xóa hũ
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirmRemainder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Còn thiếu {remaining}%</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Tổng tỷ lệ hiện nhỏ hơn 100%. Bạn có muốn MagerLife tự tạo hũ "Tiền thừa" với {remaining}% còn lại rồi lưu không?
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowConfirmRemainder(false)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">
                Chỉnh lại
              </button>
              <button onClick={saveWithRemainderJar} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white">
                Tạo và lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function OnboardingView({
  profile,
  onProfileUpdate,
}: {
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const [profileInput, setProfileInput] = useState("");
  const [lastUpdate, setLastUpdate] = useState<string[]>([]);
  const age = profile?.birthday ? Math.max(0, new Date().getFullYear() - new Date(profile.birthday).getFullYear()) : 0;
  const goalGroups = profile?.goalGroups;
  const groupedGoals = goalGroups
    ? [
        goalGroups.nutrition ? `Dinh dưỡng: ${safeText(goalGroups.nutrition)}` : "",
        goalGroups.bodyChange ? `Thay đổi cơ thể: ${safeText(goalGroups.bodyChange)}` : "",
        goalGroups.training ? `Tập luyện: ${safeText(goalGroups.training)}` : "",
        goalGroups.future ? `Tương lai: ${safeText(goalGroups.future)}` : "",
      ].filter(Boolean).join("\n")
    : "";
  const goalSummary = groupedGoals || safeText(profile?.goalSummary, "Không có") || "Không có";
  const goalText = goalSummary.toLowerCase();
  const wantsFatLoss = goalText.includes("giảm mỡ") || goalText.includes("giảm cân");
  const wantsMuscleGain = goalText.includes("tăng cơ");
  const wantsWeightGain = goalText.includes("tăng mỡ") || goalText.includes("tăng nước") || goalText.includes("tăng cân");
  const tdeeMatch = safeText(profile?.calorieNote).match(/TDEE duy trì ([\d.,]+)/);
  const maintenanceKcal = tdeeMatch?.[1] ? `${tdeeMatch[1]} kcal/ngày` : "Chưa có dữ liệu";
  const kcalDirection = safeText(profile?.kcalRecommendation) || (
    wantsFatLoss
      ? "Giảm nhẹ 100 - 300kcal/ngày so với TDEE"
      : wantsWeightGain
        ? "Tăng nhẹ 200 - 300kcal/ngày so với TDEE"
        : "Ăn gần TDEE duy trì"
  );
  const systemSuggestion = safeText(profile?.systemSuggestion) || kcalDirection || "Không có";
  const supportStyle = safeText(profile?.supportStyle, "Không có") || "Không có";
  const goalCards = goalGroups
    ? [
        goalGroups.nutrition ? { label: "Dinh dưỡng", value: safeText(goalGroups.nutrition) } : null,
        goalGroups.bodyChange ? { label: "Thay đổi cơ thể", value: safeText(goalGroups.bodyChange) } : null,
        goalGroups.training ? { label: "Tập luyện", value: safeText(goalGroups.training) } : null,
        goalGroups.future ? { label: "Tương lai", value: safeText(goalGroups.future) } : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>
    : profile?.goalSummary
      ? [{ label: "Đã chọn", value: safeText(profile.goalSummary) }]
      : [];
  const suggestionCards = [
    wantsFatLoss ? { label: "Giảm mỡ", value: kcalDirection } : null,
    wantsMuscleGain ? { label: "Tăng cơ", value: "Ưu tiên protein cao và luyện tập đều." } : null,
    wantsWeightGain ? { label: "Tăng cân", value: kcalDirection } : null,
    !wantsFatLoss && !wantsMuscleGain && !wantsWeightGain && systemSuggestion !== "Không có"
      ? { label: "Khuyến nghị", value: systemSuggestion }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const goalListItems = goalCards.flatMap((item) => splitListText(item.value));
  const steps = [
    { q: "Bạn muốn MagerLife ưu tiên điều gì nhất?", a: safeText(profile?.currentPriority, "Chưa chọn ưu tiên số 1.") || "Chưa chọn ưu tiên số 1." },
    { q: "Thu nhập?", a: safeNumber(profile?.salary) > 0 ? `${formatCurrency(safeNumber(profile?.salary), profile?.currency || "VND")}/tháng` : "Chưa cập nhật lương." },
    { q: "Chỉ số sức khỏe chính?", a: `${age ? `${age} tuổi - ` : ""}${safeText(profile?.weight, "?") || "?"}kg - ${safeText(profile?.height, "?") || "?"}cm.` },
    { q: "Mục tiêu?", a: goalSummary, type: "goals" },
    { q: "Kcal duy trì?", a: maintenanceKcal },
    { q: "Hệ thống đề xuất?", a: systemSuggestion, type: "suggestions" },
    { q: "Phong cách hỗ trợ mong muốn?", a: supportStyle },
  ];
  const extractedStates = [
    {
      label: "Thu nhập",
      value: safeNumber(profile?.salary) > 0 ? formatCurrency(safeNumber(profile?.salary), profile?.currency || "VND") : "Chưa có",
      confidence: "92%",
      note: "Dùng để chia hũ, dự báo dòng tiền và giới hạn ngân sách ăn uống.",
    },
    {
      label: "Mục tiêu sức khỏe",
      value: goalSummary,
      confidence: "86%",
      note: `Kcal duy trì: ${maintenanceKcal}. Hệ thống đề xuất: ${systemSuggestion || kcalDirection}`,
    },
    {
      label: "Mức tự động hóa",
      value: "Gợi ý trước, người dùng xác nhận",
      confidence: "78%",
      note: "Free nên ưu tiên giải thích rõ lý do thay vì tự động thay đổi kế hoạch.",
    },
    {
      label: "Nhạy cảm ngân sách ăn uống",
      value: safeText(profile?.budgetStyle, "Chưa rõ") || "Chưa rõ",
      confidence: "81%",
      note: "Dùng để chọn món ăn, meal prep và cảnh báo khi ăn ngoài quá nhiều.",
    },
  ];

  function submitProfileUpdate() {
    const text = profileInput.trim();
    if (!text) return;
    const patch = parseProfilePatchFromText(text, profile);
    const nextSignals = profileSignalChips(patch.extractedSignals);
    const updates = [
      patch.salary ? `Thu nhập: ${formatCurrency(patch.salary, profile?.currency || "VND")}/tháng` : "",
      patch.foodMonthlyBudget ? `Ngân sách ăn uống: ${formatCurrency(patch.foodMonthlyBudget, profile?.currency || "VND")}/tháng` : "",
      patch.weight ? `Cân nặng: ${patch.weight}kg` : "",
      patch.height ? `Chiều cao: ${patch.height}cm` : "",
      patch.healthGoal ? `Hướng sức khỏe: ${patch.healthGoal === "lose" ? "giảm cân/giảm mỡ" : patch.healthGoal === "gain" ? "tăng cân/tăng cơ" : "duy trì"}` : "",
      nextSignals.length ? `Tín hiệu: ${nextSignals.map((item) => item.label).join(", ")}` : "",
    ].filter(Boolean);
    onProfileUpdate(patch, text);
    setLastUpdate(updates.length ? updates : ["Đã lưu ghi chú vào hồ sơ để hệ thống dùng làm ngữ cảnh."]);
    setProfileInput("");
  }

  function splitListText(value: string) {
    return safeText(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function renderStepAnswer(step: { a: string; type?: string }) {
    if (step.type === "goals") {
      if (!goalListItems.length) return <p className="text-sm mt-1">Không có</p>;
      return (
        <ul className="mt-2 space-y-1.5">
          {goalListItems.map((value) => (
            <li key={value} className="flex gap-2 text-sm font-semibold leading-relaxed text-white">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
              <span>{value}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (step.type === "suggestions") {
      if (!suggestionCards.length) return <p className="text-sm mt-1">Không có</p>;
      return (
        <div className="mt-2 space-y-2">
          {suggestionCards.map((item) => (
            <div key={item.label} className="rounded-lg border border-white/10 bg-white/7 px-3 py-2">
              <p className="text-[11px] font-black uppercase tracking-wide text-cyan-200">{item.label}</p>
              <ul className="mt-1 space-y-1">
                {splitListText(item.value).map((value) => (
                  <li key={value} className="flex gap-2 text-sm font-semibold leading-relaxed text-white">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                    <span>{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
    }
    return <p className="whitespace-pre-line text-sm mt-1">{step.a}</p>;
  }

  return (
    <main className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
      <Glass className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <div>
          <Mono className="text-emerald-700">Bổ sung dữ liệu</Mono>
          <h1 className="text-lg font-bold text-slate-900">Cập nhật hồ sơ qua hội thoại</h1>
          </div>
        </div>
        <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Mono className="text-emerald-700">Profile updater</Mono>
              <h2 className="mt-1 text-sm font-black text-slate-900">Nhập thông tin mới để hệ thống cập nhật lại profile</h2>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-emerald-700">Rule extraction</span>
          </div>
          <textarea
            value={profileInput}
            onChange={(event) => setProfileInput(event.target.value)}
            rows={4}
            placeholder="VD: Lương tháng này 12 triệu, tiền ăn 4 triệu, 52kg 163cm, muốn giảm mỡ nhưng đang đau gối và khá bận."
            className="mt-3 w-full resize-none rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-300"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-emerald-800">
              Hệ thống sẽ trích xuất thu nhập, ngân sách ăn uống, chỉ số cơ thể, mục tiêu và tín hiệu cá nhân để đưa vào Agent context.
            </p>
            <button
              onClick={submitProfileUpdate}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              Cập nhật profile
            </button>
          </div>
          {lastUpdate.length > 0 && (
            <div className="mt-3 rounded-lg border border-white/80 bg-white/80 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Vừa cập nhật</p>
              <ul className="mt-2 space-y-1">
                {lastUpdate.map((item) => (
                  <li key={item} className="flex gap-2 text-xs font-semibold leading-relaxed text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.q} className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3">
              <div className="rounded-lg border border-white/80 bg-white/65 p-3">
                <Mono className="text-slate-400">MagerLife · Q{index + 1}</Mono>
                <p className="text-sm text-slate-700 mt-1">{step.q}</p>
              </div>
              <div className="rounded-lg bg-slate-900 p-3 text-white">
                <Mono className="text-white/50">User</Mono>
                {renderStepAnswer(step)}
              </div>
            </div>
          ))}
        </div>
      </Glass>

      <div className="space-y-4">
      <Glass className="p-4">
        <Mono className="text-emerald-700">Trạng thái đã hiểu</Mono>
        <h2 className="text-base font-bold text-slate-900 mb-4">Dữ liệu có thể cập nhật vào hệ thống</h2>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          Đây là những điều hệ thống suy ra từ đăng ký, thiết lập ban đầu và hội thoại. Chỉ số % là độ tin cậy tạm thời, sau này sẽ tăng/giảm theo tương tác.
        </p>
        {extractedStates.map((item) => (
          <div key={item.label} className="py-3 border-b border-slate-100 last:border-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{item.label}</span>
              <span className="text-xs font-mono text-slate-400">{item.confidence}</span>
            </div>
            <p className="text-sm font-bold text-slate-900 mt-1">{item.value}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.note}</p>
          </div>
        ))}
      </Glass>
      <AgentDecisionPanel insights={insights} />
      </div>
    </main>
  );
}

function BrainView({
  memories,
  setMemories,
  agentEvents,
}: {
  memories: Memory[];
  setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
  agentEvents: AgentEvent[];
}) {
  const shownAgentEvents = agentEvents.slice(-8).reverse();
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("");

  function exportAgentEvents() {
    const blob = new Blob([JSON.stringify(agentEvents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `magerlife-agent-events-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportTrainingJsonl() {
    const samples = buildAgentTrainingSamples(agentEvents);
    const blob = new Blob([serializeTrainingSamplesAsJsonl(samples)], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `magerlife-training-samples-${new Date().toISOString().slice(0, 10)}.jsonl`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function syncAgentEvents() {
    if (!agentEvents.length || syncStatus === "syncing") return;
    setSyncStatus("syncing");
    setSyncMessage("Đang gửi event log lên mock API...");
    const profileEmail = [...agentEvents].reverse().find((event) => event.profileEmail)?.profileEmail;
    const eventsToSync = agentEvents.slice(-100);
    const result = await syncAgentEventsToApi({
      userId: profileEmail || "local-demo-user",
      events: eventsToSync,
    });
    if (result.ok) {
      setSyncStatus("success");
      setSyncMessage(`Đã sync ${result.data?.accepted || 0} event. Backend mock đã nhận dữ liệu.`);
      return;
    }
    setSyncStatus("error");
    setSyncMessage(result.error?.message || "Không sync được event log. Hãy bật npm run api:mock rồi thử lại.");
  }

  function removeMemory(id: string) {
    setMemories((prev) => prev.filter((memory) => memory.id !== id));
  }

  function confirmMemory(id: string) {
    setMemories((prev) => prev.map((memory) => memory.id === id ? { ...memory, confidence: 0.99, source: "user_input", lastVerified: "2026-05-31" } : memory));
  }

  return (
    <main className="p-4 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-3">
        <Glass className="p-4">
          <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center mb-4">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <Mono className="text-emerald-700">Privacy Hub</Mono>
          <h1 className="text-lg font-bold text-slate-900 mb-3">My Brain</h1>
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Memories</span>
              <span className="text-sm font-bold text-slate-900">{memories.length}</span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Avg confidence</span>
              <span className="text-sm font-bold text-slate-900">
                {Math.round((memories.reduce((sum, item) => sum + item.confidence, 0) / memories.length) * 100)}%
              </span>
            </div>
          </div>
        </Glass>

        <Glass className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Mono className="text-sky-700">Training Data</Mono>
              <h2 className="mt-1 text-sm font-black text-slate-900">Agent event log</h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={exportAgentEvents}
                disabled={!agentEvents.length}
                className="rounded-lg border border-sky-100 bg-white px-2.5 py-1.5 text-[11px] font-black text-sky-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                JSON
              </button>
              <button
                type="button"
                onClick={exportTrainingJsonl}
                disabled={!agentEvents.length}
                className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                JSONL
              </button>
              <button
                type="button"
                onClick={() => void syncAgentEvents()}
                disabled={!agentEvents.length || syncStatus === "syncing"}
                className="rounded-lg border border-violet-100 bg-violet-50 px-2.5 py-1.5 text-[11px] font-black text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {syncStatus === "syncing" ? "Sync..." : "Sync API"}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Các sự kiện gần nhất để sau này lọc, gắn nhãn và huấn luyện lại Agent.</p>
          {syncMessage && (
            <p
              className={`mt-2 rounded-xl border px-3 py-2 text-xs font-bold leading-relaxed ${
                syncStatus === "success"
                  ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                  : syncStatus === "error"
                    ? "border-rose-100 bg-rose-50 text-rose-700"
                    : "border-violet-100 bg-violet-50 text-violet-700"
              }`}
            >
              {syncMessage}
            </p>
          )}
          <div className="mt-3 space-y-2">
            {shownAgentEvents.length ? shownAgentEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-100 bg-white/75 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">{event.type}</span>
                  <span className="text-[10px] font-mono text-slate-400">{new Date(event.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-600">{event.source}</p>
              </div>
            )) : (
              <div className="rounded-xl border border-slate-100 bg-white/70 p-3 text-xs font-semibold leading-relaxed text-slate-500">
                Chưa có event. Hãy chat, cập nhật profile hoặc ghi món ăn để hệ thống bắt đầu thu thập dữ liệu.
              </div>
            )}
          </div>
        </Glass>
      </div>

      <div className="space-y-3">
        {memories.map((memory) => (
          <Glass key={memory.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">{memory.category}</span>
                  <Mono className="text-slate-400">{memory.source}</Mono>
                </div>
                <p className="text-sm text-slate-800 leading-relaxed">{memory.content}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => confirmMemory(memory.id)} className="h-8 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Confirm
                </button>
                <button onClick={() => removeMemory(memory.id)} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_80px] gap-3 items-center">
              <Progress value={memory.confidence * 100} tone={memory.confidence > 0.8 ? "bg-emerald-500" : "bg-amber-400"} />
              <span className="text-xs text-right font-mono text-slate-500">{Math.round(memory.confidence * 100)}%</span>
            </div>
          </Glass>
        ))}
      </div>
    </main>
  );
}

function RoutingView({ insights }: { insights: ReturnType<typeof buildDashboardInsights> }) {
  const rows = [
    { layer: "Rule Engine", load: "64%", cost: "0 token", examples: "validate hũ, tính kcal, cảnh báo budget", icon: Gauge },
    { layer: "Small Router", load: "21%", cost: "rất thấp", examples: "intent, priority, cần LLM hay không", icon: Route },
    { layer: "LLM API", load: "15%", cost: "có token", examples: "trade-off reasoning, explainability, planning", icon: Brain },
  ];

  return (
    <main className="p-4 grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
      <Glass className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <Route className="h-4 w-4 text-emerald-600" />
          <div>
            <Mono className="text-emerald-700">RL vs API</Mono>
            <h1 className="text-lg font-bold text-slate-900">Token routing policy</h1>
          </div>
        </div>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.layer} className="rounded-lg border border-white/80 bg-white/65 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center">
                  <row.icon className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">{row.layer}</h2>
                    <Mono className="text-slate-400">{row.cost}</Mono>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{row.examples}</p>
                </div>
              </div>
              <Progress value={Number(row.load.replace("%", ""))} tone={row.layer === "LLM API" ? "bg-rose-400" : "bg-emerald-500"} />
            </div>
          ))}
        </div>
      </Glass>

      <Glass className="p-4">
        <Mono className="text-emerald-700">Cost Guard</Mono>
        <h2 className="text-base font-bold text-slate-900 mb-4">Current target</h2>
        <div className="text-5xl font-bold text-slate-900 mb-1">85%</div>
        <p className="text-xs text-slate-500 mb-4">requests handled before LLM</p>
        <div className="space-y-2">
          {["Không train LLM từ đầu", "Fine-tune router nhỏ sau khi có data", "LLM chỉ dùng cho reasoning phức tạp"].map((item) => (
            <div key={item} className="flex items-center gap-2 text-xs text-slate-700">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              {item}
            </div>
          ))}
        </div>
      </Glass>
    </main>
  );
}

function AdminOverviewView({
  profile,
  users,
  foodLibrary,
  agentEvents,
  setTab,
}: {
  profile: UserProfile | null;
  users: ReturnType<typeof loadUserAccountRecords>;
  foodLibrary: FoodLibraryItem[];
  agentEvents: AgentEvent[];
  setTab: (tab: Tab) => void;
}) {
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [apiAdminSnapshot, setApiAdminSnapshot] = useState<AdminAnalyticsResponse | null>(null);

  useEffect(() => {
    if (profile?.role !== "admin" || !profile.email) {
      setApiAdminSnapshot(null);
      return;
    }
    let cancelled = false;
    void getAdminAnalyticsFromApi({ adminUserId: profile.email }).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setApiAdminSnapshot(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.email, profile?.role, syncStatus]);

  if (profile?.role !== "admin") {
    return (
      <main className="p-4">
        <Glass className="p-6">
          <Mono className="text-rose-600">Admin only</Mono>
          <h1 className="mt-1 text-xl font-black text-slate-900">Bạn cần tài khoản Admin</h1>
          <p className="mt-2 text-sm text-slate-500">Trang này dùng để giám sát user, gói đăng ký, doanh thu, dữ liệu training và kho món hệ thống.</p>
        </Glass>
      </main>
    );
  }

  const localAnalytics = buildAdminAnalyticsSnapshot({ users, foodLibrary, agentEvents });
  const analytics = apiAdminSnapshot?.analytics || localAnalytics;
  const trainingRecords = apiAdminSnapshot?.trainingRecords || loadAgentTrainingRecords();
  const planRows = [
    { label: "Gói miễn phí", key: "free" as const, price: 0, color: "bg-sky-400" },
    { label: "Gói Pro", key: "pro" as const, price: 149_000, color: "bg-fuchsia-400" },
  ];
  const maxPlanCount = Math.max(1, ...planRows.map((row) => analytics.planCounts[row.key]));
  const recentEvents = (apiAdminSnapshot?.recentEvents || agentEvents.slice(-6).reverse()).slice(0, 6);

  async function syncPersistence() {
    if (!profile || syncStatus === "syncing") return;
    setSyncStatus("syncing");
    const result = await syncPersistenceSnapshotToApi({
      userId: profile.email || "local-admin",
      profile,
      nutritionLogs: profile.nutritionMeals || [],
      agentEvents,
      trainingRecords,
      foodLibrary,
    });
    setSyncStatus(result.ok ? "done" : "error");
  }

  return (
    <main className="space-y-4 p-4">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Tổng user", analytics.totalUsers, "Tài khoản đã tạo", "from-sky-400 to-cyan-300", Database],
          ["Đã đăng ký gói", analytics.paidUsers, "User Pro đang trả phí", "from-fuchsia-400 to-pink-300", Crown],
          ["Đang hoạt động", analytics.activeUsers, "Ước tính active demo", "from-emerald-400 to-teal-300", Activity],
          ["Tổng doanh thu", formatCurrency(analytics.revenue, "VND"), "MRR giả lập theo Pro", "from-orange-400 to-amber-300", DollarSign],
        ].map(([label, value, note, tone, Icon]) => (
          <Glass key={String(label)} className="relative overflow-hidden p-5">
            <div className={`absolute inset-x-6 bottom-4 h-1 rounded-full bg-gradient-to-r ${tone as string}`} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase text-slate-400">{String(label)}</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{String(value)}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{String(note)}</p>
              </div>
              <div className={`rounded-2xl bg-gradient-to-br ${tone as string} p-3 text-white shadow-lg shadow-slate-200`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </Glass>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <Glass className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Mono className="text-sky-600">User analytics</Mono>
              <h2 className="mt-1 text-lg font-black text-slate-900">Tỷ lệ user theo gói</h2>
            </div>
            <button onClick={() => setTab("account")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
              Tài khoản
            </button>
          </div>
          <div className="mt-6 space-y-4">
            {planRows.map((row) => {
              const count = analytics.planCounts[row.key];
              const width = Math.max(4, Math.round((count / maxPlanCount) * 100));
              return (
                <div key={row.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-black text-slate-700">{row.label}</span>
                    <span className="font-black text-slate-900">{count} user</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-100">
                    <div className={`h-3 rounded-full ${row.color}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Glass>

        <Glass className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Mono className="text-emerald-600">Agent data pipeline</Mono>
              <h2 className="mt-1 text-lg font-black text-slate-900">Dữ liệu để train lại Agent</h2>
            </div>
            <button onClick={() => setTab("brain")} className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              Xem log
            </button>
            <button onClick={() => void syncPersistence()} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-50" disabled={syncStatus === "syncing"}>
              {syncStatus === "syncing" ? "Đang sync..." : syncStatus === "done" ? "Đã sync" : syncStatus === "error" ? "Sync lỗi" : "Sync dữ liệu"}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ["Event", analytics.agentEventCount],
              ["Pending món", analytics.pendingFoodRequests],
              ["Kho món", analytics.foodLibraryCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white bg-white/70 p-3">
                <p className="text-[11px] font-black uppercase text-slate-400">{String(label)}</p>
                <p className="mt-1 text-xl font-black text-slate-900">{String(value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {recentEvents.length ? recentEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-black text-slate-800">{event.type}</span>
                  <span className="text-slate-400">{new Date(event.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="mt-1 line-clamp-1 font-semibold text-slate-500">{event.source}</p>
              </div>
            )) : (
              <p className="rounded-xl bg-white/60 px-3 py-4 text-sm font-semibold text-slate-500">Chưa có event. Khi user chat, cập nhật profile hoặc ghi món, dữ liệu sẽ xuất hiện ở đây.</p>
            )}
          </div>
        </Glass>
      </section>

      <Glass className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Mono className="text-fuchsia-600">Revenue table</Mono>
            <h2 className="mt-1 text-lg font-black text-slate-900">Doanh thu từng gói</h2>
          </div>
          <button onClick={() => setTab("food-admin")} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white">
            Quản lý kho món
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <div className="grid grid-cols-4 bg-gradient-to-r from-amber-100 via-emerald-100 to-cyan-100 px-4 py-3 text-xs font-black uppercase text-slate-700">
            <span>Gói</span>
            <span>Lượt đăng ký</span>
            <span>Giá lẻ</span>
            <span>Doanh thu</span>
          </div>
          {planRows.map((row) => (
            <div key={row.key} className="grid grid-cols-4 border-t border-slate-100 bg-white/70 px-4 py-3 text-sm font-bold text-slate-700">
              <span>{row.label}</span>
              <span>{analytics.planCounts[row.key]}</span>
              <span>{formatCurrency(row.price, "VND")}</span>
              <span className="text-orange-600">{formatCurrency(row.price * analytics.planCounts[row.key], "VND")}</span>
            </div>
          ))}
        </div>
      </Glass>
    </main>
  );
}

function FoodAdminView({
  profile,
  foodLibrary,
  setFoodLibrary,
}: {
  profile: UserProfile | null;
  foodLibrary: FoodLibraryItem[];
  setFoodLibrary: React.Dispatch<React.SetStateAction<FoodLibraryItem[]>>;
}) {
  const [draft, setDraft] = useState({
    name: "",
    aliases: "",
    servingGram: "100",
    servingUnit: "g",
    kcalPer100g: "",
    proteinPer100g: "",
    carbsPer100g: "",
    fatPer100g: "",
    fiberPer100g: "",
    tags: "",
  });
  const [query, setQuery] = useState("");
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [foodFormError, setFoodFormError] = useState("");
  const foodImportRef = useRef<HTMLInputElement | null>(null);
  const pendingFoodRequests = profile?.pendingNutritionApiRequests?.filter((request) => request.status === "pending") || [];

  function patchDraft(key: keyof typeof draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetFoodDraft() {
    setDraft({ name: "", aliases: "", servingGram: "100", servingUnit: "g", kcalPer100g: "", proteinPer100g: "", carbsPer100g: "", fatPer100g: "", fiberPer100g: "", tags: "" });
    setEditingFoodId(null);
    setFoodFormError("");
  }

  function normalizedFoodTokens(item: { name: string; aliases: string[] }) {
    return [item.name, ...item.aliases].map((value) => value.trim().toLowerCase()).filter(Boolean);
  }

  function findDuplicateFood(nextName: string, nextAliases: string[], ignoreId: string | null) {
    const nextTokens = new Set(normalizedFoodTokens({ name: nextName, aliases: nextAliases }));
    return foodLibrary.find((food) => {
      if (ignoreId && food.id === ignoreId) return false;
      return normalizedFoodTokens(food).some((token) => nextTokens.has(token));
    });
  }

  function saveFood() {
    setFoodFormError("");
    const kcal = Number(draft.kcalPer100g);
    if (!draft.name.trim() || !Number.isFinite(kcal) || kcal <= 0) {
      setFoodFormError("Cần nhập tên món và kcal/100g hợp lệ.");
      return;
    }
    const aliases = draft.aliases
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const duplicate = findDuplicateFood(draft.name.trim(), aliases, editingFoodId);
    if (duplicate) {
      setFoodFormError(`Tên hoặc alias đang trùng với món "${duplicate.name}".`);
      return;
    }
    const nextItem: FoodLibraryItem = {
      id: editingFoodId || `${Date.now()}-admin-food`,
      name: draft.name.trim(),
      aliases,
      servingGram: Number(draft.servingGram) || 100,
      servingUnit: normalizeFoodServingUnit(draft.servingUnit),
      kcalPer100g: kcal,
      proteinPer100g: Number(draft.proteinPer100g) || 0,
      carbsPer100g: Number(draft.carbsPer100g) || 0,
      fatPer100g: Number(draft.fatPer100g) || 0,
      fiberPer100g: Number(draft.fiberPer100g) || 0,
      tags: draft.tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      source: "admin",
      updatedAt: new Date().toISOString(),
    };
    setFoodLibrary((prev) => editingFoodId ? prev.map((food) => (food.id === editingFoodId ? nextItem : food)) : [nextItem, ...prev]);
    resetFoodDraft();
  }

  function removeFood(foodId: string) {
    setFoodLibrary((prev) => prev.filter((food) => food.id !== foodId));
    if (editingFoodId === foodId) resetFoodDraft();
  }

  function editFood(food: FoodLibraryItem) {
    setEditingFoodId(food.id);
    setFoodFormError("");
    setDraft({
      name: food.name,
      aliases: food.aliases.join(", "),
      servingGram: String(food.servingGram || 100),
      servingUnit: food.servingUnit || "g",
      kcalPer100g: String(food.kcalPer100g || ""),
      proteinPer100g: String(food.proteinPer100g || ""),
      carbsPer100g: String(food.carbsPer100g || ""),
      fatPer100g: String(food.fatPer100g || ""),
      fiberPer100g: String(food.fiberPer100g || ""),
      tags: (food.tags || []).join(", "),
    });
  }

  function exportFoodLibrary() {
    const blob = new Blob([JSON.stringify(foodLibrary, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `magerlife-admin-food-library-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importFoodLibrary(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "[]")) as FoodLibraryItem[];
        const validItems = parsed.filter((item) => item?.id && item?.name && Number(item.kcalPer100g) > 0);
        if (!validItems.length) return;
        setFoodLibrary((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          return [...validItems.filter((item) => !existingIds.has(item.id)), ...prev];
        });
      } catch {
        // Invalid JSON import is ignored in the demo admin flow.
      }
    };
    reader.readAsText(file);
    if (foodImportRef.current) foodImportRef.current.value = "";
  }

  const filteredFoods = foodLibrary.filter((food) => {
    const text = [food.name, ...food.aliases, ...(food.tags || [])].join(" ").toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <main className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Glass className="p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <Mono className="text-emerald-700">Admin Food Library</Mono>
            <h1 className="mt-1 text-xl font-black text-slate-900">Kho thực phẩm chuẩn</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Admin nhập món chuẩn để chatbot match trước khi gọi API/LLM. Đây sẽ là nguồn dữ liệu sạch cho model nền sau này.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={foodImportRef} type="file" accept="application/json" className="hidden" onChange={(event) => importFoodLibrary(event.target.files?.[0])} />
            <button type="button" onClick={() => foodImportRef.current?.click()} className="rounded-lg border border-emerald-100 bg-white px-2.5 py-1.5 text-[11px] font-black text-emerald-700">
              Import
            </button>
            <button type="button" onClick={exportFoodLibrary} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700">
              Export
            </button>
            <Database className="h-5 w-5 text-emerald-500" />
          </div>
        </div>

        <div className="space-y-3">
          {editingFoodId && (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs font-bold leading-relaxed text-sky-800">
              Đang sửa món trong kho. Lưu sẽ thay thế bản ghi cũ, không tạo món mới.
            </div>
          )}
          <input value={draft.name} onChange={(event) => patchDraft("name", event.target.value)} placeholder="Tên món, VD: Cơm gạo lứt" className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          <input value={draft.aliases} onChange={(event) => patchDraft("aliases", event.target.value)} placeholder="Alias, cách gọi khác, cách nhau bằng dấu phẩy" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          <div className="grid grid-cols-2 gap-3">
            <input value={draft.servingGram} onChange={(event) => patchDraft("servingGram", event.target.value)} placeholder="Khẩu phần g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <select value={draft.servingUnit} onChange={(event) => patchDraft("servingUnit", event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400">
              {foodServingUnits.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            <input value={draft.kcalPer100g} onChange={(event) => patchDraft("kcalPer100g", event.target.value)} placeholder="kcal/100g hoặc 100ml" className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3 text-sm font-bold outline-none focus:border-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={draft.proteinPer100g} onChange={(event) => patchDraft("proteinPer100g", event.target.value)} placeholder="Đạm/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <input value={draft.carbsPer100g} onChange={(event) => patchDraft("carbsPer100g", event.target.value)} placeholder="Carb/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <input value={draft.fatPer100g} onChange={(event) => patchDraft("fatPer100g", event.target.value)} placeholder="Béo/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <input value={draft.fiberPer100g} onChange={(event) => patchDraft("fiberPer100g", event.target.value)} placeholder="Xơ/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          </div>
          <input value={draft.tags} onChange={(event) => patchDraft("tags", event.target.value)} placeholder="Tag: protein cao, món Việt, ăn chay..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          {foodFormError && <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{foodFormError}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <button type="button" onClick={saveFood} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-emerald-700">
              {editingFoodId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingFoodId ? "Lưu món" : "Thêm vào kho chuẩn"}
            </button>
            {editingFoodId && (
              <button type="button" onClick={resetFoodDraft} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                Hủy
              </button>
            )}
          </div>
        </div>
      </Glass>

      <div className="space-y-4">
        <Glass className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Mono className="text-emerald-700">Resolution Pipeline</Mono>
              <h2 className="text-lg font-black text-slate-900">Luồng xử lý khi user chat món ăn</h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">{foodLibrary.length} món chuẩn</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            {[
              ["1", "Kho cá nhân Pro", "Ưu tiên cao nhất vì đúng thói quen của user."],
              ["2", "Kho Admin", "Dữ liệu chuẩn do bạn kiểm soát kcal và macro."],
              ["3", "API/LLM fallback", "Chỉ gọi khi không match được dữ liệu."],
              ["4", "User xác nhận", "Kết quả mới được ghi vào nhật ký ăn uống."],
            ].map(([step, title, note]) => (
              <div key={step} className="rounded-2xl border border-white/80 bg-white/75 p-4 shadow-sm shadow-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">{step}</span>
                <p className="mt-3 text-sm font-black text-slate-900">{title}</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{note}</p>
              </div>
            ))}
        </div>
      </Glass>

      <Glass className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Mono className="text-amber-600">Pending Resolve</Mono>
            <h2 className="mt-1 text-lg font-black text-slate-900">Món chờ API/LLM</h2>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
              Các món user chat nhưng chưa match được kho. Khi nối API, danh sách này sẽ nhận candidate để Admin hoặc user xác nhận.
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">{pendingFoodRequests.length}</span>
        </div>
        <div className="mt-4 space-y-2">
          {pendingFoodRequests.length ? pendingFoodRequests.map((request) => (
            <div key={request.id} className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg bg-white/80 px-2 py-1 text-[10px] font-black uppercase text-amber-700">{request.meal}</span>
                <span className="text-[10px] font-mono text-slate-400">{new Date(request.createdAt).toLocaleDateString("vi-VN")}</span>
              </div>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800">{request.text}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-sm font-semibold leading-relaxed text-slate-500">
              Chưa có món nào chờ xử lý. Khi chatbot không tìm được món trong kho, request sẽ xuất hiện ở đây.
            </div>
          )}
        </div>
      </Glass>

        <Glass className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Mono className="text-slate-400">Food records</Mono>
              <h2 className="text-lg font-black text-slate-900">Danh sách món trong kho</h2>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm món, alias, tag..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 sm:w-72" />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filteredFoods.map((food) => (
              <div key={food.id} className="rounded-[22px] border-2 border-emerald-100 bg-white p-4 shadow-md shadow-emerald-50 ring-1 ring-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-900">{food.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{food.aliases.join(", ") || "Chưa có alias"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                      {food.servingGram} {food.servingUnit || "g"}
                    </span>
                    <button type="button" onClick={() => editFood(food)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-sky-600 hover:bg-sky-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeFood(food.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-500 hover:bg-rose-100">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["kcal", food.kcalPer100g],
                    ["đạm", food.proteinPer100g || 0],
                    ["carb", food.carbsPer100g || 0],
                    ["béo", food.fatPer100g || 0],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 px-2 py-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
                      <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(food.tags || []).map((tag) => (
                    <span key={tag} className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Glass>
      </div>
    </main>
  );
}

function UserFoodLibraryView({
  profile,
  onProfileUpdate,
}: {
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const isProPlan = profile?.subscriptionPlan === "pro";
  const customFoods = profile?.customFoodItems || [];
  const [draft, setDraft] = useState({
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
  const [editingCustomFoodId, setEditingCustomFoodId] = useState<string | null>(null);
  const [customFoodError, setCustomFoodError] = useState("");

  function patchDraft(key: keyof typeof draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetCustomFoodDraft() {
    setDraft({ name: "", aliases: "", servingGram: "100", servingUnit: "g", kcalPer100g: "", proteinPer100g: "", carbsPer100g: "", fatPer100g: "", fiberPer100g: "" });
    setEditingCustomFoodId(null);
    setCustomFoodError("");
  }

  function customFoodTokens(food: { name: string; aliases: string[] }) {
    return [food.name, ...food.aliases].map((item) => item.trim().toLowerCase()).filter(Boolean);
  }

  function findDuplicateCustomFood(name: string, aliases: string[], ignoreId: string | null) {
    const nextTokens = new Set(customFoodTokens({ name, aliases }));
    return customFoods.find((food) => {
      if (ignoreId && food.id === ignoreId) return false;
      return customFoodTokens(food).some((token) => nextTokens.has(token));
    });
  }

  function saveCustomFood() {
    setCustomFoodError("");
    if (!isProPlan || !draft.name.trim()) return;
    const kcal = Number(draft.kcalPer100g);
    if (!Number.isFinite(kcal) || kcal <= 0) {
      setCustomFoodError("Cần nhập tên món và kcal/100g hợp lệ.");
      return;
    }
    const aliases = draft.aliases
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const duplicate = findDuplicateCustomFood(draft.name.trim(), aliases, editingCustomFoodId);
    if (duplicate) {
      setCustomFoodError(`Tên hoặc alias đang trùng với món "${duplicate.name}".`);
      return;
    }
    const nextFood: FoodLibraryItem = {
      id: editingCustomFoodId || `${Date.now()}-user-food`,
      name: draft.name.trim(),
      aliases,
      servingGram: Number(draft.servingGram) || 100,
      servingUnit: normalizeFoodServingUnit(draft.servingUnit),
      kcalPer100g: kcal,
      proteinPer100g: Number(draft.proteinPer100g) || 0,
      carbsPer100g: Number(draft.carbsPer100g) || 0,
      fatPer100g: Number(draft.fatPer100g) || 0,
      fiberPer100g: Number(draft.fiberPer100g) || 0,
      tags: ["user-custom"],
      source: "user",
      ownerEmail: profile?.email,
      updatedAt: new Date().toISOString(),
    };
    const nextFoods = editingCustomFoodId ? customFoods.map((food) => (food.id === editingCustomFoodId ? nextFood : food)) : [nextFood, ...customFoods];
    onProfileUpdate({ customFoodItems: nextFoods }, `Pro custom food: ${nextFood.name}`);
    resetCustomFoodDraft();
  }

  function removeCustomFood(foodId: string) {
    onProfileUpdate({ customFoodItems: customFoods.filter((food) => food.id !== foodId) }, `Delete custom food: ${foodId}`);
    if (editingCustomFoodId === foodId) resetCustomFoodDraft();
  }

  function editCustomFood(food: FoodLibraryItem) {
    setEditingCustomFoodId(food.id);
    setCustomFoodError("");
    setDraft({
      name: food.name,
      aliases: food.aliases.join(", "),
      servingGram: String(food.servingGram || 100),
      servingUnit: food.servingUnit || "g",
      kcalPer100g: String(food.kcalPer100g || ""),
      proteinPer100g: String(food.proteinPer100g || ""),
      carbsPer100g: String(food.carbsPer100g || ""),
      fatPer100g: String(food.fatPer100g || ""),
      fiberPer100g: String(food.fiberPer100g || ""),
    });
  }

  if (!isProPlan) {
    return (
      <main className="p-4">
        <Glass className="mx-auto max-w-3xl p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 shadow-lg shadow-amber-100">
              <Crown className="h-6 w-6" />
            </div>
            <div>
              <Mono className="text-amber-600">Pro feature</Mono>
              <h1 className="mt-1 text-2xl font-black text-slate-900">Kho món cá nhân</h1>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                Free vẫn dùng kho món chuẩn của hệ thống khi chat. Nâng cấp Pro để tự thêm món riêng, kcal và macro riêng; hệ thống sẽ ưu tiên dữ liệu cá nhân của bạn trước khi dùng kho Admin hoặc API.
              </p>
              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                {["Tự nhập món hay ăn", "Tự chỉnh kcal/macro", "Ưu tiên khi chatbot match món"].map((item) => (
                  <div key={item} className="rounded-2xl border border-amber-100 bg-amber-50/60 p-3 text-sm font-black text-amber-800">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Glass>
      </main>
    );
  }

  return (
    <main className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Glass className="p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <Mono className="text-emerald-700">Pro Food Library</Mono>
            <h1 className="mt-1 text-xl font-black text-slate-900">Kho món cá nhân</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Chỉ thêm món riêng của bạn. Kho chuẩn Admin vẫn được hệ thống dùng ngầm và không hiển thị ở tài khoản người dùng.
            </p>
          </div>
          <Crown className="h-5 w-5 text-amber-500" />
        </div>
        <div className="space-y-3">
          {editingCustomFoodId && (
            <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs font-bold leading-relaxed text-sky-800">
              Đang sửa món cá nhân. Hệ thống sẽ ưu tiên bản ghi này khi chatbot match món.
            </div>
          )}
          <input value={draft.name} onChange={(event) => patchDraft("name", event.target.value)} placeholder="Tên món riêng" className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          <input value={draft.aliases} onChange={(event) => patchDraft("aliases", event.target.value)} placeholder="Alias, cách gọi khác" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <input value={draft.servingGram} onChange={(event) => patchDraft("servingGram", event.target.value)} placeholder="Khẩu phần" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <select value={draft.servingUnit} onChange={(event) => patchDraft("servingUnit", event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400">
              {foodServingUnits.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>
          <input value={draft.kcalPer100g} onChange={(event) => patchDraft("kcalPer100g", event.target.value)} placeholder="kcal/100g hoặc 100ml" className="w-full rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-3 text-sm font-bold outline-none focus:border-amber-400" />
          <div className="grid grid-cols-2 gap-3">
            <input value={draft.proteinPer100g} onChange={(event) => patchDraft("proteinPer100g", event.target.value)} placeholder="Đạm/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <input value={draft.carbsPer100g} onChange={(event) => patchDraft("carbsPer100g", event.target.value)} placeholder="Carb/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <input value={draft.fatPer100g} onChange={(event) => patchDraft("fatPer100g", event.target.value)} placeholder="Béo/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <input value={draft.fiberPer100g} onChange={(event) => patchDraft("fiberPer100g", event.target.value)} placeholder="Xơ/100g" className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          </div>
          {customFoodError && <p className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{customFoodError}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <button type="button" onClick={saveCustomFood} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-emerald-700">
              {editingCustomFoodId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingCustomFoodId ? "Lưu món cá nhân" : "Thêm món cá nhân"}
            </button>
            {editingCustomFoodId && (
              <button type="button" onClick={resetCustomFoodDraft} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-50">
                Hủy
              </button>
            )}
          </div>
        </div>
      </Glass>

      <Glass className="p-4">
        <Mono className="text-emerald-700">Personal records</Mono>
        <h2 className="text-lg font-black text-slate-900">Món cá nhân đã thêm</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {customFoods.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm font-semibold text-slate-500">Chưa có món cá nhân nào.</div>
          ) : (
            customFoods.map((food) => (
              <div key={food.id} className="rounded-[22px] border-2 border-slate-200 bg-white p-4 shadow-md shadow-slate-100 ring-1 ring-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-slate-900">{food.name}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{food.servingGram} {food.servingUnit || "g"} mỗi khẩu phần</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{food.aliases.join(", ") || "Chưa có alias"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => editCustomFood(food)} className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-sky-600 hover:bg-sky-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => removeCustomFood(food.id)} className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-rose-500 hover:bg-rose-100">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    ["kcal", food.kcalPer100g],
                    ["đạm", food.proteinPer100g || 0],
                    ["carb", food.carbsPer100g || 0],
                    ["béo", food.fatPer100g || 0],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
                      <p className="mt-0.5 text-sm font-black text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Glass>
    </main>
  );
}

function FoodLibraryView({
  profile,
  onProfileUpdate,
  foodLibrary,
  setFoodLibrary,
}: {
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
  foodLibrary: FoodLibraryItem[];
  setFoodLibrary: React.Dispatch<React.SetStateAction<FoodLibraryItem[]>>;
}) {
  if (profile?.role === "admin") {
    return <FoodAdminView profile={profile} foodLibrary={foodLibrary} setFoodLibrary={setFoodLibrary} />;
  }

  return <UserFoodLibraryView profile={profile} onProfileUpdate={onProfileUpdate} />;
}

function AccountView({
  profile,
  onProfileUpdate,
}: {
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: profile?.name || "",
    birthday: profile?.birthday || "",
    gender: profile?.gender || "",
    weight: profile?.weight || "",
    height: profile?.height || "",
    salary: profile?.salary ? profile.salary.toLocaleString("vi-VN") : "",
    foodMonthlyBudget: profile?.foodMonthlyBudget ? profile.foodMonthlyBudget.toLocaleString("vi-VN") : "",
    currency: profile?.currency || "VND",
    subscriptionPlan: profile?.subscriptionPlan || "free",
    role: profile?.role || "user",
    interests: profile?.interests || "",
    supportStyle: profile?.supportStyle || "",
  });
  const [savedText, setSavedText] = useState("");

  useEffect(() => {
    setDraft({
      name: profile?.name || "",
      birthday: profile?.birthday || "",
      gender: profile?.gender || "",
      weight: profile?.weight || "",
      height: profile?.height || "",
      salary: profile?.salary ? profile.salary.toLocaleString("vi-VN") : "",
      foodMonthlyBudget: profile?.foodMonthlyBudget ? profile.foodMonthlyBudget.toLocaleString("vi-VN") : "",
      currency: profile?.currency || "VND",
      subscriptionPlan: profile?.subscriptionPlan || "free",
      role: profile?.role || "user",
      interests: profile?.interests || "",
      supportStyle: profile?.supportStyle || "",
    });
  }, [profile]);

  function patchDraft(key: keyof typeof draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function patchMoneyDraft(key: "salary" | "foodMonthlyBudget", value: string) {
    const digits = value.replace(/\D/g, "");
    patchDraft(key, digits ? Number(digits).toLocaleString("vi-VN") : "");
  }

  function readMoney(value: string) {
    return Number(value.replace(/\D/g, ""));
  }

  function saveAccount() {
    const salaryValue = readMoney(draft.salary);
    const foodBudgetValue = readMoney(draft.foodMonthlyBudget);
    const patch: Partial<UserProfile> = {
      name: draft.name.trim(),
      birthday: draft.birthday,
      gender: draft.gender,
      weight: draft.weight.trim(),
      height: draft.height.trim(),
      currency: draft.currency as MoneyCurrency,
      subscriptionPlan: draft.subscriptionPlan as SubscriptionPlan,
      role: draft.role as "user" | "admin",
      interests: draft.interests.trim(),
      supportStyle: draft.supportStyle.trim(),
    };
    if (salaryValue > 0) patch.salary = salaryValue;
    if (foodBudgetValue > 0) patch.foodMonthlyBudget = foodBudgetValue;
    onProfileUpdate(patch, "Người dùng cập nhật thông tin tài khoản và dữ liệu nền.");
    setSavedText("Đã cập nhật profile. Dashboard, My Brain và các agent sẽ đọc lại dữ liệu mới.");
  }

  const birthdayValid = Boolean(draft.birthday && new Date(draft.birthday).getTime() <= Date.now());
  const kcalReady = birthdayValid && Boolean(draft.gender && Number(draft.weight) > 0 && Number(draft.height) > 0);

  return (
    <main className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <Glass className="p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <Mono className="text-emerald-700">Account Profile</Mono>
            <h1 className="mt-1 text-xl font-black text-slate-900">Tài khoản & dữ liệu nền</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Các thông tin này là nền cho kcal, ngân sách, meal recommendation, planner và agent routing.
            </p>
          </div>
          <Settings className="h-5 w-5 text-emerald-500" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Tên hiển thị</span>
            <input value={draft.name} onChange={(event) => patchDraft("name", event.target.value)} placeholder="VD: Nguyễn Văn A" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Email</span>
            <input value={profile?.email || ""} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 outline-none" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Ngày sinh</span>
            <input type="date" max={new Date().toISOString().slice(0, 10)} value={draft.birthday} onChange={(event) => patchDraft("birthday", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Giới tính</span>
            <select value={draft.gender} onChange={(event) => patchDraft("gender", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400">
              <option value="">Chọn giới tính</option>
              <option value="Nam">Nam</option>
              <option value="Nữ">Nữ</option>
              <option value="Khác">Khác</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Cân nặng hiện tại</span>
            <input value={draft.weight} onChange={(event) => patchDraft("weight", event.target.value)} placeholder="VD: 51" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Chiều cao</span>
            <input value={draft.height} onChange={(event) => patchDraft("height", event.target.value)} placeholder="VD: 163" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400" />
          </label>
          <label className="space-y-1.5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
            <span className="text-xs font-bold text-emerald-700">Thu nhập</span>
            <input value={draft.salary} onChange={(event) => patchMoneyDraft("salary", event.target.value)} placeholder="VD: 9.000.000" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-emerald-400" />
          </label>
          <label className="space-y-1.5 rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
            <span className="text-xs font-bold text-sky-700">Ngân sách ăn uống/tháng</span>
            <input value={draft.foodMonthlyBudget} onChange={(event) => patchMoneyDraft("foodMonthlyBudget", event.target.value)} placeholder="VD: 4.000.000" className="w-full rounded-xl border border-sky-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-sky-400" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Loại tiền</span>
            <select value={draft.currency} onChange={(event) => patchDraft("currency", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400">
              <option value="VND">VNĐ</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Phong cách hỗ trợ</span>
            <input value={draft.supportStyle} onChange={(event) => patchDraft("supportStyle", event.target.value)} placeholder="VD: Gợi ý rõ lý do, tôi tự xác nhận" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400" />
          </label>
          <label className="space-y-1.5 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
            <span className="text-xs font-bold text-violet-700">Gói sử dụng</span>
            <select value={draft.subscriptionPlan} onChange={(event) => patchDraft("subscriptionPlan", event.target.value)} className="w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-violet-400">
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
          </label>
          <label className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <span className="text-xs font-bold text-slate-600">Vai trò</span>
            <select value={draft.role} onChange={(event) => patchDraft("role", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold outline-none focus:border-slate-400">
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold text-slate-500">Nội dung quan tâm</span>
            <textarea value={draft.interests} onChange={(event) => patchDraft("interests", event.target.value)} placeholder="AI, tài chính, gym, thời tiết, luật giao thông..." className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-400" />
          </label>
        </div>

        {savedText && <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">{savedText}</p>}

        <div className="mt-5 flex justify-end">
          <button onClick={saveAccount} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800">
            Lưu thay đổi
          </button>
        </div>
      </Glass>

      <div className="space-y-4">
        <Glass className="p-4">
          <Mono className="text-emerald-700">System Readiness</Mono>
          <h2 className="mt-1 text-base font-black text-slate-900">Trạng thái dữ liệu</h2>
          <div className="mt-4 space-y-3">
            {[
              ["Kcal/TDEE", kcalReady ? "Đủ dữ liệu" : "Thiếu ngày sinh, giới tính, cân nặng hoặc chiều cao", kcalReady],
              ["Tài chính", readMoney(draft.salary) > 0 ? formatCurrency(readMoney(draft.salary), draft.currency as MoneyCurrency) : "Chưa có thu nhập", readMoney(draft.salary) > 0],
              ["Ăn uống", readMoney(draft.foodMonthlyBudget) > 0 ? `${formatCurrency(readMoney(draft.foodMonthlyBudget), draft.currency as MoneyCurrency)}/tháng` : "Chưa có ngân sách ăn", readMoney(draft.foodMonthlyBudget) > 0],
            ].map(([label, value, ok]) => (
              <div key={String(label)} className="rounded-xl border border-slate-100 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-400"}`} />
                </div>
                <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
              </div>
            ))}
          </div>
        </Glass>
        <Glass className="p-4">
          <Mono className="text-slate-500">Next API Contract</Mono>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Khi nối backend, form này nên gọi API lưu `profile`, còn Chat/Agent sẽ đọc cùng một nguồn dữ liệu thay vì local state.
          </p>
        </Glass>
      </div>
    </main>
  );
}

function Dashboard({
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
        <AgentMesh />
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
        <DailyBrief jars={jars} insights={insights} />
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

function shouldEnrichProfileWithApi(sourceText: string, patch: Partial<UserProfile>) {
  const normalized = sourceText.toLowerCase();
  if (!sourceText.trim()) return false;
  if (normalized.includes("api/llm")) return false;
  if (normalized.includes("api fallback")) return false;
  if (normalized.startsWith("nutrition_tracking_mode=")) return false;
  if (normalized.startsWith("chế độ ăn hiện tại:")) return false;
  if (normalized.startsWith("pro custom food:")) return false;
  if (normalized.startsWith("delete custom food:")) return false;
  if (normalized.startsWith("sửa nhật ký ăn uống:")) return false;
  if (normalized.startsWith("xóa nhật ký ăn uống:")) return false;
  if (patch.nutritionMeals || patch.pendingNutritionApiRequests || patch.customFoodItems || patch.mealPlanSlots) return false;
  return sourceText.length >= 16;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [monthlyIncome, setMonthlyIncome] = useState(salary);
  const [currency, setCurrency] = useState<MoneyCurrency>("VND");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [jars, setJars] = useState<Jar[]>(initialJars);
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [adminFoodLibrary, setAdminFoodLibrary] = useState<FoodLibraryItem[]>(() => loadAdminFoodLibrary());
  const foodLibraryApiReadyRef = useRef(false);
  const financeApiReadyRef = useRef(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>(() => loadAgentEvents());
  const adminUsers = useMemo(() => loadUserAccountRecords(), [profile, isAuthenticated]);

  const background = useMemo(
    () => ({
      background:
        "linear-gradient(135deg, #f6fbf8 0%, #eef7f2 45%, #f7faf8 100%)",
    }),
    []
  );

  useEffect(() => {
    saveAdminFoodLibrary(adminFoodLibrary);
    if (!foodLibraryApiReadyRef.current) return;
    void saveFoodLibraryToApi({
      userId: profile?.email || "local-admin",
      items: adminFoodLibrary,
    });
  }, [adminFoodLibrary]);

  useEffect(() => {
    let cancelled = false;
    void getFoodLibraryFromApi({ scope: "admin" }).then((result) => {
      if (cancelled) return;
      foodLibraryApiReadyRef.current = true;
      if (result.ok && result.data?.items?.length) {
        setAdminFoodLibrary(result.data.items);
        return;
      }
      void saveFoodLibraryToApi({
        userId: profile?.email || "local-admin",
        items: adminFoodLibrary,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !profile?.email || !financeApiReadyRef.current) return;
    void saveFinanceSnapshotToApi({
      userId: profile.email,
      financeSnapshot: {
        userId: profile.email,
        currency,
        jars,
        transactions,
        updatedAt: new Date().toISOString(),
      },
    });
  }, [isAuthenticated, profile?.email, currency, jars, transactions]);

  function recordAgentEvent(event: Parameters<typeof appendAgentEvent>[0]) {
    const nextEvent = appendAgentEvent(event);
    appendAgentTrainingRecord(nextEvent);
    setAgentEvents((prev) => [...prev, nextEvent].slice(-300));
    if (nextEvent.profileEmail) {
      void syncAgentEventsToApi({
        userId: nextEvent.profileEmail,
        events: [nextEvent],
      });
    }
  }

  function completeAuth(nextProfile: UserProfile) {
    const normalizedProfile: UserProfile = {
      ...nextProfile,
      subscriptionPlan: nextProfile.subscriptionPlan || "free",
      role: nextProfile.role || "user",
    };
    const income = normalizedProfile.salary || salary;
    const starterJars = createStarterJarsForCurrency(income, normalizedProfile.currency || "VND", normalizedProfile.foodMonthlyBudget || 0);
    setProfile(normalizedProfile);
    setMonthlyIncome(income);
    setCurrency(normalizedProfile.currency || "VND");
    setJars(starterJars);
    setTransactions([]);
    setMemories(createMemoriesFromProfile(normalizedProfile));
    setTab("dashboard");
    setIsAuthenticated(true);
    financeApiReadyRef.current = false;
    void getFinanceSnapshotFromApi({ userId: normalizedProfile.email }).then((result) => {
      if (result.ok && result.data?.financeSnapshot?.jars?.length) {
        const snapshot = result.data.financeSnapshot;
        setJars(snapshot.jars);
        setTransactions(snapshot.transactions || []);
        if (snapshot.currency) setCurrency(snapshot.currency);
        financeApiReadyRef.current = true;
        return;
      }
      financeApiReadyRef.current = true;
      void saveFinanceSnapshotToApi({
        userId: normalizedProfile.email,
        financeSnapshot: {
          userId: normalizedProfile.email,
          currency: normalizedProfile.currency || "VND",
          jars: starterJars,
          transactions: [],
          updatedAt: new Date().toISOString(),
        },
      });
    });
    recordAgentEvent({
      type: "auth_completed",
      source: "auth_flow",
      profileEmail: normalizedProfile.email,
      payload: {
        setupComplete: normalizedProfile.setupComplete,
        hasKcalBase: Boolean(normalizedProfile.birthday && normalizedProfile.gender && normalizedProfile.weight && normalizedProfile.height),
        currency: normalizedProfile.currency || "VND",
        subscriptionPlan: normalizedProfile.subscriptionPlan || "free",
      },
    });
  }

  function updateProfileFromConversation(patch: Partial<UserProfile>, sourceText: string) {
    const baseProfile: UserProfile = profile || {
      email: "demo@magerlife.local",
      birthday: "",
      gender: "Chưa cập nhật",
      setupComplete: true,
    };
    const nextProfile = buildNextUserProfile(baseProfile, patch, sourceText);
    setProfile(nextProfile);
    if (nextProfile.salary) setMonthlyIncome(nextProfile.salary);
    if (nextProfile.currency) setCurrency(nextProfile.currency);
    setMemories(createMemoriesFromProfile(nextProfile));
    saveAuthAccount<UserProfile>(nextProfile.email, nextProfile);
    void saveProfileToApi({
      userId: nextProfile.email,
      patch: nextProfile,
    });
    if (patch.nutritionMeals?.length) {
      const previousMeals = baseProfile.nutritionMeals || [];
      const changedMeals = patch.nutritionMeals.filter((meal) => {
        const previousMeal = previousMeals.find((item) => item.id === meal.id);
        return !previousMeal || JSON.stringify(previousMeal) !== JSON.stringify(meal);
      });
      changedMeals.forEach((mealLog) => {
        void logNutritionMealToApi({
          userId: nextProfile.email,
          mealLog,
        });
      });
    }
    if (patch.customFoodItems?.length) {
      void saveFoodLibraryToApi({
        userId: nextProfile.email,
        items: patch.customFoodItems,
      });
    }
    recordAgentEvent({
      type: classifyProfileUpdateEvent(patch as Record<string, unknown>, sourceText),
      source: sourceText,
      profileEmail: nextProfile.email,
      payload: {
        changedFields: Object.keys(patch),
        patch,
      },
    });
    if (shouldEnrichProfileWithApi(sourceText, patch)) {
      void updateProfileViaApi({
        profile: nextProfile,
        patch,
        sourceText,
      }).then((result) => {
        if (!result.ok || !result.data?.profile) return;
        const apiPatch = result.data.profile;
        const apiChangedFields = Object.keys(apiPatch).filter((key) => JSON.stringify(apiPatch[key as keyof UserProfile]) !== JSON.stringify(nextProfile[key as keyof UserProfile]));
        if (!apiChangedFields.length) return;
        setProfile((current) => {
          const currentProfile = current || nextProfile;
          const enrichedProfile = buildNextUserProfile(currentProfile, apiPatch, `Profile API enrichment: ${sourceText}`);
          saveAuthAccount<UserProfile>(enrichedProfile.email, enrichedProfile);
          void saveProfileToApi({
            userId: enrichedProfile.email,
            patch: enrichedProfile,
          });
          if (apiPatch.nutritionMeals?.length) {
            apiPatch.nutritionMeals.forEach((mealLog) => {
              void logNutritionMealToApi({
                userId: enrichedProfile.email,
                mealLog,
              });
            });
          }
          if (apiPatch.customFoodItems?.length) {
            void saveFoodLibraryToApi({
              userId: enrichedProfile.email,
              items: apiPatch.customFoodItems,
            });
          }
          setMemories(createMemoriesFromProfile(enrichedProfile));
          if (enrichedProfile.salary) setMonthlyIncome(enrichedProfile.salary);
          if (enrichedProfile.currency) setCurrency(enrichedProfile.currency);
          return enrichedProfile;
        });
        recordAgentEvent({
          type: "profile_updated",
          source: `Profile API enrichment: ${sourceText}`,
          profileEmail: nextProfile.email,
          payload: {
            changedFields: apiChangedFields,
            patch: apiPatch,
            warnings: result.data?.warnings || [],
          },
        });
      });
    }
  }

  return (
    <div className="min-h-screen text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", ...background }}>
      <div className="relative z-10 min-h-screen">
        {!isAuthenticated ? (
          <AuthFlow onComplete={completeAuth} />
        ) : (
          <>
        <Header tab={tab} setTab={setTab} profile={profile} />
        {tab === "dashboard" && <Dashboard jars={jars} transactions={transactions} profile={profile} currency={currency} adminFoodLibrary={adminFoodLibrary} onProfileUpdate={updateProfileFromConversation} />}
        {tab === "finance" && <FinanceView jars={jars} setJars={setJars} transactions={transactions} setTransactions={setTransactions} salary={monthlyIncome} currency={currency} />}
        {tab === "onboarding" && <OnboardingView profile={profile} onProfileUpdate={updateProfileFromConversation} />}
        {tab === "account" && <AccountView profile={profile} onProfileUpdate={updateProfileFromConversation} />}
        {tab === "admin" && <AdminOverviewView profile={profile} users={adminUsers} foodLibrary={adminFoodLibrary} agentEvents={agentEvents} setTab={setTab} />}
        {tab === "food-admin" && <FoodLibraryView profile={profile} onProfileUpdate={updateProfileFromConversation} foodLibrary={adminFoodLibrary} setFoodLibrary={setAdminFoodLibrary} />}
        {tab === "brain" && <BrainView memories={memories} setMemories={setMemories} agentEvents={agentEvents} />}
        {tab === "routing" && <RoutingView insights={buildDashboardInsights(profile, jars, transactions, currency)} />}
          </>
        )}
      </div>
    </div>
  );
}
