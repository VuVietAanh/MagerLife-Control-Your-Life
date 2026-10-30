import React from "react";
import { ChevronDown, Database, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type UserProfile } from "../../models/profile";
import { NUTRIENT_CATALOG, PROBIOTIC_STRAINS, type FoodLibraryItem, type NutrientDefinition, type ProbioticStrain } from "../../services/foodLibraryService";
import { getNutrientCatalogFromApi } from "../../services/magerLifeApiFacade";
import { foodServingUnits, normalizeFoodServingUnit } from "../../lib/nutritionText";
import { Glass, Mono } from "../../ui/primitives";

export function FoodAdminView({
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
  // Amounts for everything beyond the five core macros, keyed by nutrient key and
  // held as strings so a half-typed value doesn't get coerced to NaN mid-edit.
  const [extraNutrients, setExtraNutrients] = useState<Record<string, string>>({});
  const [nutrientsExpanded, setNutrientsExpanded] = useState(false);
  // Only one group stays open at a time, so the full catalog never lands on screen together.
  const [openNutrientGroup, setOpenNutrientGroup] = useState<string | null>(null);
  const [probioticsExpanded, setProbioticsExpanded] = useState(false);
  // The catalog comes from the database, so the form can only offer what the
  // nutrients table actually holds — a bundled list would drift out of sync.
  const [nutrientCatalog, setNutrientCatalog] = useState<NutrientDefinition[]>([]);
  const [probioticStrains, setProbioticStrains] = useState<ProbioticStrain[]>([]);
  // CFU counts keyed by strain, kept apart from extraNutrients because they're a
  // live-culture count rather than a nutrient amount.
  const [strainCfu, setStrainCfu] = useState<Record<string, string>>({});
  const [catalogState, setCatalogState] = useState<"loading" | "ready" | "offline">("loading");
  const [query, setQuery] = useState("");
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [foodFormError, setFoodFormError] = useState("");
  const foodImportRef = useRef<HTMLInputElement | null>(null);
  const pendingFoodRequests = profile?.pendingNutritionApiRequests?.filter((request) => request.status === "pending") || [];

  useEffect(() => {
    let cancelled = false;
    void getNutrientCatalogFromApi().then((result) => {
      if (cancelled) return;
      if (result.ok && result.data?.nutrients?.length) {
        setNutrientCatalog(result.data.nutrients);
        setProbioticStrains(result.data.probioticStrains || []);
        setCatalogState("ready");
        return;
      }
      // Fall back to the bundled seed so an admin isn't blocked, but say so plainly
      // rather than passing stale data off as the live catalog.
      setNutrientCatalog(NUTRIENT_CATALOG);
      setProbioticStrains(PROBIOTIC_STRAINS);
      setCatalogState("offline");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const strainsByGenus = probioticStrains.reduce<{ genus: string; items: ProbioticStrain[] }[]>((acc, strain) => {
    const bucket = acc.find((entry) => entry.genus === strain.genus);
    if (bucket) bucket.items.push(strain);
    else acc.push({ genus: strain.genus, items: [strain] });
    return acc;
  }, []);
  const filledStrainCount = Object.values(strainCfu).filter((value) => Number(value) > 0).length;

  /** Splits a group into its subgroups, preserving catalog order and keeping
   *  unlabelled nutrients together in a leading block. */
  function groupSubgroups(items: NutrientDefinition[]) {
    const order: string[] = [];
    const bySubgroup: Record<string, NutrientDefinition[]> = {};
    items.forEach((definition) => {
      const subgroup = definition.subgroup || "";
      if (!bySubgroup[subgroup]) {
        bySubgroup[subgroup] = [];
        order.push(subgroup);
      }
      bySubgroup[subgroup].push(definition);
    });
    return order.map((subgroup) => ({ subgroup, items: bySubgroup[subgroup] }));
  }

  // Core macros have their own inputs above, so they're excluded here rather than
  // offered twice and written through two different storage paths.
  const nutrientsByGroup = nutrientCatalog.filter((definition) => !definition.isCore).reduce<Record<string, NutrientDefinition[]>>((acc, definition) => {
    const group = definition.groupName || "Khác";
    if (!acc[group]) acc[group] = [];
    acc[group].push(definition);
    return acc;
  }, {});
  const nutrientGroupNames = Object.keys(nutrientsByGroup);
  const filledExtraNutrientCount = Object.values(extraNutrients).filter((value) => Number(value) > 0).length;

  function patchDraft(key: keyof typeof draft, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function resetFoodDraft() {
    setDraft({ name: "", aliases: "", servingGram: "100", servingUnit: "g", kcalPer100g: "", proteinPer100g: "", carbsPer100g: "", fatPer100g: "", fiberPer100g: "", tags: "" });
    setExtraNutrients({});
    setStrainCfu({});
    setNutrientsExpanded(false);
    setOpenNutrientGroup(null);
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
      nutrients: nutrientCatalog.filter((definition) => !definition.isCore).flatMap((definition) => {
        const amount = Number(extraNutrients[definition.key]);
        // Blank or zero means "not measured" rather than "contains none".
        if (!Number.isFinite(amount) || amount <= 0) return [];
        return [{ ...definition, amount }];
      }),
      probiotics: probioticStrains.flatMap((strain) => {
        const cfu = Number(strainCfu[strain.key]);
        if (!Number.isFinite(cfu) || cfu <= 0) return [];
        return [{ ...strain, cfu }];
      }),
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
    const storedAmounts: Record<string, string> = {};
    (food.nutrients || []).forEach((entry) => {
      storedAmounts[entry.key] = String(entry.amount);
    });
    setExtraNutrients(storedAmounts);
    const storedCfu: Record<string, string> = {};
    (food.probiotics || []).forEach((entry) => {
      storedCfu[entry.key] = String(entry.cfu);
    });
    setStrainCfu(storedCfu);
    const hasStored = Object.keys(storedAmounts).length > 0;
    setNutrientsExpanded(hasStored);
    setOpenNutrientGroup(
      hasStored
        ? nutrientCatalog.find((definition) => Number(storedAmounts[definition.key]) > 0)?.groupName || null
        : null
    );
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
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-500">Tên món <span className="text-rose-500">*</span></span>
            <input value={draft.name} onChange={(event) => patchDraft("name", event.target.value)} placeholder="VD: Cơm gạo lứt" className="w-full rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-500">Tên gọi khác (alias)</span>
            <input value={draft.aliases} onChange={(event) => patchDraft("aliases", event.target.value)} placeholder="Cách nhau bằng dấu phẩy: cơm lứt, com lut, brown rice" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            <span className="block text-[10px] font-medium text-slate-400">Giúp chatbot nhận ra món khi người dùng gõ kiểu khác.</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Khẩu phần quy chiếu</span>
              <input value={draft.servingGram} onChange={(event) => patchDraft("servingGram", event.target.value)} placeholder="100" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Đơn vị đo</span>
              <select value={draft.servingUnit} onChange={(event) => patchDraft("servingUnit", event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-400">
                {foodServingUnits.map((unit) => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Năng lượng (kcal) <span className="text-rose-500">*</span></span>
              <input value={draft.kcalPer100g} onChange={(event) => patchDraft("kcalPer100g", event.target.value)} placeholder="VD: 76" className="w-full rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-3 text-sm font-bold outline-none focus:border-amber-400" />
            </label>
          </div>
          <p className="text-[10px] font-medium text-slate-400">
            Bốn chỉ số dưới đây tính trên đúng khẩu phần quy chiếu ở trên, đơn vị gam.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Đạm / protein (g)</span>
              <input value={draft.proteinPer100g} onChange={(event) => patchDraft("proteinPer100g", event.target.value)} placeholder="VD: 8" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Tinh bột / carb (g)</span>
              <input value={draft.carbsPer100g} onChange={(event) => patchDraft("carbsPer100g", event.target.value)} placeholder="VD: 1.9" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Chất béo (g)</span>
              <input value={draft.fatPer100g} onChange={(event) => patchDraft("fatPer100g", event.target.value)} placeholder="VD: 4.8" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold text-slate-500">Chất xơ (g)</span>
              <input value={draft.fiberPer100g} onChange={(event) => patchDraft("fiberPer100g", event.target.value)} placeholder="VD: 0.3" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
            </label>
          </div>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <button
              type="button"
              onClick={() => setNutrientsExpanded((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span>
                <span className="block text-[11px] font-black text-slate-700">Chất dinh dưỡng khác</span>
                <span className="block text-[10px] font-medium text-slate-400">
                  {catalogState === "loading"
                    ? "Đang tải danh mục từ cơ sở dữ liệu..."
                    : `${nutrientCatalog.length} chất trong ${nutrientGroupNames.length} nhóm — điền chất nào biết, bỏ trống phần còn lại.`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500">
                {filledExtraNutrientCount > 0 && <span className="text-emerald-600">{filledExtraNutrientCount}</span>}
                {nutrientsExpanded ? "Thu gọn" : "Mở rộng"}
                <ChevronDown className={`h-3 w-3 transition-transform ${nutrientsExpanded ? "rotate-180" : ""}`} />
              </span>
            </button>

            {nutrientsExpanded && catalogState === "offline" && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-bold leading-relaxed text-amber-800">
                Không đọc được danh mục từ cơ sở dữ liệu, đang dùng bản dự phòng đi kèm ứng dụng.
                Danh sách dưới đây có thể khác với dữ liệu thật trên server.
              </p>
            )}

            {nutrientsExpanded && (
              <div className="space-y-1.5 border-t border-slate-200 pt-3">
                {nutrientGroupNames.map((groupName) => {
                  const groupNutrients = nutrientsByGroup[groupName];
                  const filledInGroup = groupNutrients.filter((definition) => Number(extraNutrients[definition.key]) > 0).length;
                  const isOpen = openNutrientGroup === groupName;
                  return (
                    <div key={groupName} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setOpenNutrientGroup(isOpen ? null : groupName)}
                        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition hover:bg-slate-50"
                      >
                        <span className="text-[11px] font-black text-slate-700">{groupName}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {filledInGroup > 0 && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
                              {filledInGroup}
                            </span>
                          )}
                          <span className="text-[9px] font-bold text-slate-400">{groupNutrients.length} chất</span>
                          <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/60 p-2.5">
                          {groupSubgroups(groupNutrients).map(({ subgroup, items }) => (
                            <div key={subgroup || "_"} className="space-y-1.5">
                              {subgroup && (
                                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{subgroup}</p>
                              )}
                              <div className="grid grid-cols-2 gap-2">
                                {items.map((definition) => (
                                  <label key={definition.key} className="block space-y-1">
                                    <span className="block text-[10px] font-bold leading-tight text-slate-500">
                                      {definition.name} <span className="font-medium text-slate-400">({definition.unit})</span>
                                    </span>
                                    <input
                                      value={extraNutrients[definition.key] || ""}
                                      onChange={(event) =>
                                        setExtraNutrients((prev) => ({ ...prev, [definition.key]: event.target.value }))
                                      }
                                      inputMode="decimal"
                                      placeholder="0"
                                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold outline-none focus:border-emerald-400"
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {probioticStrains.length > 0 && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <button
                type="button"
                onClick={() => setProbioticsExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span>
                  <span className="block text-[11px] font-black text-slate-700">Men vi sinh (probiotic)</span>
                  <span className="block text-[10px] font-medium text-slate-400">
                    Đếm theo CFU, tách riêng khỏi chất dinh dưỡng — chỉ điền với men vi sinh, sữa chua, thực phẩm lên men.
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500">
                  {filledStrainCount > 0 && <span className="text-emerald-600">{filledStrainCount}</span>}
                  {probioticsExpanded ? "Thu gọn" : "Mở rộng"}
                  <ChevronDown className={`h-3 w-3 transition-transform ${probioticsExpanded ? "rotate-180" : ""}`} />
                </span>
              </button>

              {probioticsExpanded && (
                <div className="space-y-2.5 border-t border-slate-200 pt-3">
                  {strainsByGenus.map(({ genus, items }) => (
                    <div key={genus} className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase italic tracking-wide text-slate-400">{genus}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {items.map((strain) => (
                          <label key={strain.key} className="block space-y-1">
                            <span className="block text-[10px] font-bold italic leading-tight text-slate-500">
                              {strain.name} <span className="not-italic font-medium text-slate-400">(CFU)</span>
                            </span>
                            <input
                              value={strainCfu[strain.key] || ""}
                              onChange={(event) => setStrainCfu((prev) => ({ ...prev, [strain.key]: event.target.value }))}
                              inputMode="numeric"
                              placeholder="VD: 1000000000"
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold outline-none focus:border-emerald-400"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-slate-500">Tag phân loại</span>
            <input value={draft.tags} onChange={(event) => patchDraft("tags", event.target.value)} placeholder="protein cao, món Việt, ăn chay..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-400" />
          </label>
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
