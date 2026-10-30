import { useEffect, useState } from "react";
import { getVietnameseLunarDate } from "../lib/lunarCalendar";

export function useRealtimeCalendar() {
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
