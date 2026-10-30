import { type Memory } from "../models/agent";
import { type Jar, type MoneyCurrency, type Transaction } from "../models/finance";
import { type UserProfile } from "../models/profile";
import { profileSignalChips } from "../services/profileService";
import { formatCurrency } from "../lib/format";

export const salary = 28_000_000;

export const initialJars: Jar[] = [
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

export const initialMemories: Memory[] = [
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

export const initialTransactions: Transaction[] = [
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

export function isFixedFoodJar(jar: Pick<Jar, "id" | "name">) {
  const name = jar.name.toLowerCase();
  return jar.id === "necessities" || name.includes("ăn uống") || name.includes("an uong");
}

export function createStarterJarsForCurrency(monthlyIncome: number, currency: MoneyCurrency, foodMonthlyBudget = 0): Jar[] {
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

export function createMemoriesFromProfile(profile: UserProfile): Memory[] {
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
