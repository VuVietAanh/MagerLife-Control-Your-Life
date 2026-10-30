import { type MoneyCurrency } from "../models/finance";

export function money(value: number) {
  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2)}M`;
}

export function formatCurrency(value: number, currency: MoneyCurrency = "VND") {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (currency === "USD") return `$${safeValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `${Math.round(safeValue).toLocaleString("vi-VN")} VNĐ`;
}

export const usdToVndRate = 25_000;
