import { Activity, AlertCircle, DollarSign, Moon, Sparkles } from "lucide-react";
import { Glass, Mono, Progress } from "../../ui/primitives";
import { buildDashboardInsights } from "./insights";

export function StateEngine({ insights }: { insights: ReturnType<typeof buildDashboardInsights> }) {
  const metrics = [
    { label: "Health", value: insights.healthScore, icon: Activity, tone: "bg-blue-500", text: `${insights.healthScore}%` },
    { label: "Finance", value: insights.financeScore, icon: DollarSign, tone: "bg-violet-500", text: `${insights.financeScore}%` },
    { label: "Living jar used", value: insights.livingUsedRatio, icon: Moon, tone: "bg-amber-400", text: `${insights.livingUsedRatio}%` },
  ];

  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Mono className="text-emerald-700">User State Engine</Mono>
          <h2 className="text-base font-bold text-slate-900">Current state</h2>
        </div>
        <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-emerald-600" />
        </div>
      </div>

      <div className="space-y-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <metric.icon className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-600">{metric.label}</span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-800">{metric.text}</span>
            </div>
            <Progress value={metric.value} tone={metric.tone} />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed text-amber-800">
          Ưu tiên hiện tại: {insights.priority}.
        </p>
      </div>
    </Glass>
  );
}
