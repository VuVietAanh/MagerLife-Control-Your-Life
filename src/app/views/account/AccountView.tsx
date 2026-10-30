import { Brain, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { type MoneyCurrency } from "../../models/finance";
import { type UserProfile } from "../../models/profile";
import { salary } from "../../data/starterData";
import { formatCurrency } from "../../lib/format";
import { Glass, Mono } from "../../ui/primitives";
import { AiSettingsCard } from "./AiSettingsCard";
import { Dashboard } from "../dashboard/Dashboard";

export function AccountView({
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
      <div className="xl:col-span-2">
        <AiSettingsCard profile={profile} onProfileUpdate={onProfileUpdate} />
      </div>
    </main>
  );
}
