import React from "react";

export function Glass({ children, className = "", ...props }: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode; className?: string }) {
  return (
    <section {...props} className={`border border-white/70 bg-white/58 shadow-[0_8px_30px_rgba(15,23,42,0.07)] backdrop-blur-2xl rounded-lg ${className}`}>
      {children}
    </section>
  );
}

export function Mono({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[10px] uppercase tracking-wide ${className}`}>{children}</span>;
}

export function Progress({ value, tone = "bg-emerald-500" }: { value: number; tone?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
