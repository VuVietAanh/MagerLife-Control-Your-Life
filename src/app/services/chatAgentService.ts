import { createPendingNutritionApiRequest, type NutritionApiRequest } from "./nutritionApiService";
import { checkKcalDailyGuard } from "./nutritionRuleService";

export type ChatAgentJarContext = {
  id: string;
  name: string;
  percentage: number;
  balance: number;
};

export type ChatAgentMealLog = {
  meal: string;
  name: string;
  kcal: number;
  carbs?: number;
  protein?: number;
  fat?: number;
  fiber?: number;
  price?: number;
  createdAt?: string;
};

export type ChatAgentProfileContext<TMealLog extends ChatAgentMealLog> = {
  nutritionMeals?: TMealLog[];
  pendingNutritionApiRequests?: NutritionApiRequest[];
  calorieNote?: string;
};

export type ChatAgentTurnRequest<TProfile extends ChatAgentProfileContext<TMealLog>, TMealLog extends ChatAgentMealLog> = {
  text: string;
  jars: ChatAgentJarContext[];
  profile: TProfile | null;
  resolveMealLog: (text: string) => TMealLog | null;
  looksLikeFoodLog: (text: string) => boolean;
  detectMealFromText: (text: string) => string;
  moneyFormatter: (value: number) => string;
};

export type ChatAgentTurnResult<TProfile> = {
  aiText: string;
  profilePatch?: Partial<TProfile>;
  profileSourceText?: string;
};

function answerByLocalRules(text: string, jars: ChatAgentJarContext[], moneyFormatter: (value: number) => string) {
  const normalized = text.toLowerCase();
  const mainJar = jars.reduce((max, jar) => (jar.percentage > max.percentage ? jar : max), jars[0]);
  if (mainJar && normalized.includes("phở")) {
    return `Có thể ăn phở nếu chọn phần thường dưới 55K và tính vào hũ ${mainJar.name}. Lý do: hũ này còn ${moneyFormatter(mainJar.balance)}, hôm nay bạn cần bữa dễ tiêu nhưng nên tránh topping thêm.`;
  }
  if (normalized.includes("khóa") || normalized.includes("hoc") || normalized.includes("học")) {
    const learning = jars.find((jar) => jar.id === "learning");
    return `Nên mua nếu khóa học gắn trực tiếp với mục tiêu tăng thu nhập. Hũ ${learning?.name || "Học tập"} còn ${moneyFormatter(learning?.balance || 0)}, nhưng nên đặt tiêu chí hoàn thành trước khi mua khóa tiếp theo.`;
  }
  return "Mình sẽ xử lý bằng rule trước, sau đó mới gọi LLM nếu cần phân tích trade-off giữa tiền, sức khỏe và lịch.";
}

function readDailyTdee(calorieNote = "") {
  const match = calorieNote.match(/TDEE duy trì\s*([\d.,]+)/i);
  if (!match?.[1]) return 0;
  return Number(match[1].replace(/[^\d]/g, ""));
}

function buildMealGuardText<TMealLog extends ChatAgentMealLog>(
  profile: ChatAgentProfileContext<TMealLog> | null,
  mealLog: TMealLog
) {
  const dailyTarget = readDailyTdee(profile?.calorieNote);
  if (!dailyTarget) return "";
  const todayKey = new Date().toISOString().slice(0, 10);
  const previousIntake = (profile?.nutritionMeals || [])
    .filter((meal) => (meal.createdAt || "").slice(0, 10) === todayKey)
    .reduce((sum, meal) => sum + meal.kcal, 0);
  const guard = checkKcalDailyGuard(previousIntake + mealLog.kcal, dailyTarget);
  const total = previousIntake + mealLog.kcal;
  if (guard.status === "ok") return ` Tổng hôm nay: ${total}/${dailyTarget} kcal.`;
  return ` Tổng hôm nay: ${total}/${dailyTarget} kcal. Cảnh báo: ${guard.message}`;
}

export function resolveChatAgentTurn<TProfile extends ChatAgentProfileContext<TMealLog>, TMealLog extends ChatAgentMealLog>(
  request: ChatAgentTurnRequest<TProfile, TMealLog>
): ChatAgentTurnResult<TProfile> {
  const text = request.text.trim();
  const mealLog = request.resolveMealLog(text);
  const shouldFallbackToApi = !mealLog && request.looksLikeFoodLog(text);

  if (mealLog) {
    const guardText = buildMealGuardText(request.profile, mealLog);
    return {
      aiText: `Đã ghi vào nhật ký ${mealLog.meal}: ${mealLog.name} (${mealLog.kcal} kcal).${guardText}`,
      profilePatch: {
        nutritionMeals: [...(request.profile?.nutritionMeals || []), mealLog],
      } as Partial<TProfile>,
      profileSourceText: `Chatbot ghi nhận dinh dưỡng: ${mealLog.meal} - ${mealLog.name} - ${mealLog.kcal} kcal`,
    };
  }

  if (shouldFallbackToApi) {
    const pendingRequest = createPendingNutritionApiRequest(text, request.detectMealFromText(text));
    return {
      aiText: "Mình chưa có đủ dữ liệu gram/ml chuẩn cho món này. Mình đã đưa sang API/LLM để ước tính khẩu phần, kcal và macro; kết quả chỉ được ghi vào nhật ký sau khi bạn xác nhận.",
      profilePatch: {
        pendingNutritionApiRequests: [...(request.profile?.pendingNutritionApiRequests || []), pendingRequest],
      } as Partial<TProfile>,
      profileSourceText: `Nutrition API fallback pending: ${pendingRequest.text}`,
    };
  }

  return {
    aiText: answerByLocalRules(text, request.jars, request.moneyFormatter),
  };
}
