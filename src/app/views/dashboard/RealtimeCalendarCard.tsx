import { useRealtimeCalendar } from "../../hooks/useRealtimeCalendar";
import { Glass } from "../../ui/primitives";

export function RealtimeCalendarCard({ calendar }: { calendar: ReturnType<typeof useRealtimeCalendar> }) {
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
