import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { type UserProfile } from "../../models/profile";
import { type FoodLibraryItem } from "../../services/foodLibraryService";
import { foodServingUnits, normalizeFoodServingUnit } from "../../lib/nutritionText";
import { Glass, Mono } from "../../ui/primitives";

export function UserFoodLibraryView({
  profile,
  onProfileUpdate,
}: {
  profile: UserProfile | null;
  onProfileUpdate: (patch: Partial<UserProfile>, sourceText: string) => void;
}) {
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
    if (!draft.name.trim()) return;
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
    onProfileUpdate({ customFoodItems: nextFoods }, `Custom food: ${nextFood.name}`);
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

  return (
    <main className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Glass className="p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <Mono className="text-emerald-700">Food Library</Mono>
            <h1 className="mt-1 text-xl font-black text-slate-900">Kho món cá nhân</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Chỉ thêm món riêng của bạn. Kho chuẩn Admin vẫn được hệ thống dùng ngầm và không hiển thị ở tài khoản người dùng.
            </p>
          </div>
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
