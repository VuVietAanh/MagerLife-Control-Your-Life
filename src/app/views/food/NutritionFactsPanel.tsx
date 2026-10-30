import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { type FoodLibraryItem } from "../../services/foodLibraryService";

/**
 * Shows the five core macros a user always wants at a glance, and hides everything
 * else (minerals, vitamins, fatty acids, supplements) behind an expand toggle.
 * Each extra nutrient is rendered with the unit stored alongside it in the catalog.
 */
export function NutritionFactsPanel({ food }: { food: FoodLibraryItem }) {
  const [expanded, setExpanded] = useState(false);

  const coreMacros = [
    { label: "Năng lượng", value: food.kcalPer100g || 0, unit: "kcal" },
    { label: "Carbs", value: food.carbsPer100g || 0, unit: "g" },
    { label: "Đạm", value: food.proteinPer100g || 0, unit: "g" },
    { label: "Béo", value: food.fatPer100g || 0, unit: "g" },
    { label: "Xơ", value: food.fiberPer100g || 0, unit: "g" },
  ];

  // Core macros already have their own row above, so don't repeat them in the detail list.
  const CORE_KEYS = ["kcal", "carbs", "protein", "fat", "fiber"];
  const extraNutrients = (food.nutrients || []).filter((item) => !CORE_KEYS.includes(item.key) && item.amount > 0);

  const grouped = extraNutrients.reduce<Record<string, typeof extraNutrients>>((acc, item) => {
    const group = item.groupName || "Khác";
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
  const groupNames = Object.keys(grouped);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5">
        {coreMacros.map((macro) => (
          <div key={macro.label} className="rounded-lg bg-white px-1.5 py-1.5 text-center">
            <p className="text-[10px] font-semibold text-slate-400">{macro.label}</p>
            <p className="text-xs font-black text-slate-800">
              {macro.value}
              <span className="ml-0.5 text-[9px] font-semibold text-slate-400">{macro.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {extraNutrients.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700"
          >
            {expanded ? "Thu gọn" : `Xem chi tiết (${extraNutrients.length} chất)`}
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>

          {expanded && (
            <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-2.5">
              {groupNames.map((groupName) => (
                <div key={groupName}>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{groupName}</p>
                  <div className="space-y-0.5">
                    {grouped[groupName].map((item) => (
                      <div key={item.key} className="flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="truncate text-slate-600">{item.name}</span>
                        <span className="shrink-0 font-bold text-slate-800">
                          {item.amount}
                          <span className="ml-0.5 text-[9px] font-semibold text-slate-400">{item.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
