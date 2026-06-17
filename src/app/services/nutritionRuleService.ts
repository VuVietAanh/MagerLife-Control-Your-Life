export type KcalGuardResult = {
  status: "ok" | "near_limit" | "over_limit";
  message: string;
  ratio: number;
};

export function checkKcalDailyGuard(intake: number, target: number): KcalGuardResult {
  const safeTarget = Math.max(1, target);
  const ratio = intake / safeTarget;
  if (ratio >= 1.05) {
    return {
      status: "over_limit",
      ratio,
      message: "Kcal đã vượt mục tiêu ngày. Bữa tiếp theo nên giảm năng lượng, ưu tiên rau, protein nạc và tránh đồ ngọt/chiên.",
    };
  }
  if (ratio >= 0.85) {
    return {
      status: "near_limit",
      ratio,
      message: "Kcal đang gần chạm mục tiêu ngày. Nếu còn bữa sau, nên chọn khẩu phần nhẹ và dễ kiểm soát.",
    };
  }
  return {
    status: "ok",
    ratio,
    message: "Kcal vẫn trong vùng an toàn so với mục tiêu hiện tại.",
  };
}
