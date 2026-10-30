import { Check, Heart, Info, Settings, Shield, Wallet, Zap } from "lucide-react";
import { useState } from "react";
import { type AuthDecorMode } from "../../authDecorConfig";
import { type MoneyCurrency } from "../../models/finance";
import { type UserProfile } from "../../models/profile";
import { SeasonalDecor } from "../../SeasonalDecor";
import { getAuthAccount, saveAuthAccount } from "../../services/authAccountService";
import { saveAuthSessionToken } from "../../services/authSessionService";
import { extractSignalsFromFreeText, profileSignalChips } from "../../services/profileService";
import { MAGERLIFE_API_BASE_URL } from "../../services/apiConfig";
import { getApiDbHealth, loginAccountViaApi, registerAccountViaApi, saveProfileToApi } from "../../services/magerLifeApiFacade";
import { salary, createStarterJarsForCurrency } from "../../data/starterData";
import { formatCurrency, usdToVndRate } from "../../lib/format";
import { Mono } from "../../ui/primitives";

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

export function AuthFlow({ onComplete }: { onComplete: (profile: UserProfile) => void }) {
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
      currency: form.currency,
      setupComplete: false,
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
    if (apiRegister.error?.code === "REGISTRATION_CLOSED") {
      setError(apiRegister.error.message);
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
