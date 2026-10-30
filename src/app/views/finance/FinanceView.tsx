import React from "react";
import { AlertCircle, Check, Info, Plus, Save, Settings, Sparkles, Trash2, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Jar, type MoneyCurrency, type Transaction } from "../../models/finance";
import { salary, isFixedFoodJar } from "../../data/starterData";
import { formatCurrency } from "../../lib/format";
import { Glass, Mono, Progress } from "../../ui/primitives";

const UNASSIGNED_JAR_TARGET = "__unassigned__";

export function FinanceView({
  jars,
  setJars,
  transactions,
  setTransactions,
  salary,
  currency,
  savedJars,
  setSavedJars,
  setSavedTransactions,
}: {
  jars: Jar[];
  setJars: React.Dispatch<React.SetStateAction<Jar[]>>;
  transactions: Transaction[];
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
  salary: number;
  currency: MoneyCurrency;
  savedJars: Jar[];
  setSavedJars: React.Dispatch<React.SetStateAction<Jar[]>>;
  setSavedTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const jarEditorRef = useRef<HTMLElement | null>(null);
  const transactionFormRef = useRef<HTMLDivElement | null>(null);
  const [showConfirmRemainder, setShowConfirmRemainder] = useState(false);
  const [pendingJarDelete, setPendingJarDelete] = useState<{
    jar: Jar;
    relatedTransactions: Transaction[];
    targetJarId: string;
  } | null>(null);
  const [pendingTxDelete, setPendingTxDelete] = useState<Transaction | null>(null);
  const [toast, setToast] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    emoji: "💰",
    percentage: 5,
    amountInput: "",
    purposeNote: "",
  });
  const [jarInputMode, setJarInputMode] = useState<"percent" | "amount">("percent");
  const [txDraft, setTxDraft] = useState({
    jarId: jars[0]?.id || "",
    type: "expense" as "expense" | "income",
    itemName: "",
    amount: "",
    spentAt: new Date().toISOString().slice(0, 16),
    note: "",
  });
  const totalPct = jars.reduce((sum, jar) => sum + jar.percentage, 0);
  const remaining = 100 - totalPct;
  const hasUnsavedChanges = JSON.stringify(jars) !== JSON.stringify(savedJars);
  const selectedJar = jars.find((jar) => jar.id === txDraft.jarId) || jars[0];
  const monthlyJarTotal = jars.reduce((sum, jar) => sum + jar.monthlyAllocation, 0);
  const primaryIncome = salary;
  const monthlySupportTotal = transactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : 0), 0);
  const monthlyTotal = primaryIncome + monthlySupportTotal;
  const pendingJarDeleteOptions = pendingJarDelete ? jars.filter((jar) => jar.id !== pendingJarDelete.jar.id) : [];
  const pendingJarExpenseTotal =
    pendingJarDelete?.relatedTransactions.reduce((sum, tx) => sum + (tx.type === "expense" ? tx.amount : 0), 0) || 0;
  const pendingJarIncomeTotal =
    pendingJarDelete?.relatedTransactions.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : 0), 0) || 0;
  const pendingJarNextPct = pendingJarDelete ? totalPct - pendingJarDelete.jar.percentage : totalPct;
  const pendingJarNeedsTransfer = pendingJarDelete ? pendingJarDelete.relatedTransactions.length > 0 || pendingJarDelete.jar.balance > 0 : false;
  const pendingTxDeleteJar = pendingTxDelete ? jars.find((jar) => jar.id === pendingTxDelete.jarId) : null;
  const pendingTxDeleteNextBalance =
    pendingTxDelete && pendingTxDeleteJar
      ? Math.max(0, pendingTxDeleteJar.balance + (pendingTxDelete.type === "expense" ? pendingTxDelete.amount : -pendingTxDelete.amount))
      : 0;

  function parseFinanceAmount(value: string) {
    if (currency === "USD") return Number(value.replace(/,/g, ""));
    return Number(value.replace(/\D/g, ""));
  }

  function formatFinanceInput(value: string) {
    if (currency === "USD") return value.replace(/[^\d.]/g, "");
    const digits = value.replace(/\D/g, "");
    return digits ? Number(digits).toLocaleString("vi-VN") : "";
  }

  useEffect(() => {
    if (!editingId && !editingTxId) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (editingId) {
        const insideJarForm = jarEditorRef.current?.contains(target);
        const insideEditingJar = target.closest('[data-jar-edit-surface="true"]');
        const jarEditControl = target.closest('[data-jar-edit-control="true"]');
        if (!insideJarForm && !insideEditingJar && !jarEditControl) resetDraft();
      }

      if (editingTxId) {
        const insideTransactionForm = transactionFormRef.current?.contains(target);
        const insideEditingTx = target.closest('[data-tx-edit-surface="true"]');
        const txEditControl = target.closest('[data-tx-edit-control="true"]');
        if (!insideTransactionForm && !insideEditingTx && !txEditControl) cancelEditTransaction();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [editingId, editingTxId]);

  const noteState =
    totalPct === 100
      ? {
          tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
          icon: Check,
          title: "Note:",
          text: "Phân bổ hoàn hảo. Sẵn sàng lưu.",
        }
      : totalPct < 100
        ? {
            tone: "border-blue-200 bg-blue-50 text-blue-800",
            icon: Info,
            title: "Note:",
            text: `Còn thiếu ${remaining}%. Hãy thêm hũ mới hoặc chỉnh tỷ lệ cho đủ 100%.`,
          }
        : {
            tone: "border-rose-200 bg-rose-50 text-rose-800",
            icon: AlertCircle,
            title: "Note:",
            text: `Đang vượt ${Math.abs(remaining)}%. Cần chỉnh lại tỷ lệ trước khi lưu.`,
          };

  function resetDraft() {
    const nextPct = Math.max(1, Math.min(5, Math.max(remaining, 1)));
    setDraft({
      name: "",
      emoji: "💰",
      percentage: nextPct,
      amountInput: formatFinanceInput(String(Math.round((salary * nextPct) / 100))),
      purposeNote: "",
    });
    setEditingId(null);
    setJarInputMode("percent");
  }

  function addJar() {
    if (!draft.name.trim() || draft.percentage <= 0) return;
    const currentJar = editingId ? jars.find((jar) => jar.id === editingId) : null;
    const availablePct = remaining + (currentJar?.percentage || 0);
    if (draft.percentage > availablePct) {
      setToast(`Tỷ lệ này sẽ vượt 100%. Hiện chỉ còn tối đa ${availablePct}%.`);
      return;
    }
    const monthlyAllocation =
      jarInputMode === "amount" && draft.amountInput
        ? parseFinanceAmount(draft.amountInput)
        : Math.round((salary * draft.percentage) / 100);
    if (editingId) {
      setJars((prev) =>
        prev.map((jar) =>
          jar.id === editingId
            ? {
                ...jar,
                name: draft.name,
                emoji: draft.emoji,
                percentage: draft.percentage,
                monthlyAllocation,
                balance: Math.min(jar.balance, monthlyAllocation),
                purposeNote: draft.purposeNote || "Chưa có ghi chú mục đích.",
              }
            : jar
        )
      );
    } else {
      const id = `${draft.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
      setJars((prev) => [
        ...prev,
        {
          id,
          name: draft.name,
          emoji: draft.emoji,
          percentage: draft.percentage,
          balance: monthlyAllocation,
          monthlyAllocation,
          purposeNote: draft.purposeNote || "Chưa có ghi chú mục đích.",
          linkedGoals: [],
        },
      ]);
    }
    resetDraft();
  }

  function removeJar(id: string) {
    const jar = jars.find((item) => item.id === id);
    if (!jar) return;
    if (isFixedFoodJar(jar)) {
      setToast("Hũ Ăn uống là hũ cố định để liên kết Meal Agent, kcal và ngân sách bữa ăn. Bạn có thể đổi tên, tỷ lệ hoặc số tiền, nhưng không thể xóa.");
      return;
    }
    const relatedTransactions = transactions.filter((tx) => tx.jarId === id);
    const targetJarId = jars.find((item) => item.id !== id)?.id || "";
    setPendingJarDelete({ jar, relatedTransactions, targetJarId });
  }

  function confirmDeleteJar() {
    if (!pendingJarDelete) return;
    const { jar, relatedTransactions, targetJarId } = pendingJarDelete;
    const isUnassignedChoice = targetJarId === UNASSIGNED_JAR_TARGET;
    const targetJar = jars.find((item) => item.id === targetJarId);

    if ((relatedTransactions.length > 0 || jar.balance > 0) && !targetJar && !isUnassignedChoice) {
      setToast('Hũ này còn số dư hoặc đã có giao dịch. Hãy chọn một hũ khác để chuyển, hoặc chọn "Chưa chọn" nếu muốn để lại khoản tiền thừa.');
      return;
    }

    setJars((prev) =>
      prev
        .filter((item) => item.id !== jar.id)
        .map((item) =>
          targetJar && item.id === targetJar.id
            ? {
                ...item,
                percentage: item.percentage + jar.percentage,
                monthlyAllocation: item.monthlyAllocation + jar.monthlyAllocation,
                balance: item.balance + jar.balance,
                linkedGoals: Array.from(new Set([...item.linkedGoals, ...jar.linkedGoals])),
              }
            : item
        )
    );
    setTransactions((prev) =>
      prev.flatMap((tx) => {
        if (tx.jarId !== jar.id) return [tx];
        if (!targetJar) {
          if (isUnassignedChoice) {
            return [
              {
                ...tx,
                jarId: "",
                note: tx.note ? `${tx.note} · hũ ${jar.name} đã bị xóa` : `Hũ ${jar.name} đã bị xóa`,
              },
            ];
          }
          return [];
        }
        return [
          {
            ...tx,
            jarId: targetJar.id,
            note: tx.note ? `${tx.note} · chuyển từ hũ ${jar.name}` : `Chuyển từ hũ ${jar.name}`,
          },
        ];
      })
    );
    if (editingId === jar.id) resetDraft();
    if (relatedTransactions.some((tx) => tx.id === editingTxId)) cancelEditTransaction();
    if (txDraft.jarId === jar.id) {
      setTxDraft((prev) => ({ ...prev, jarId: targetJar?.id || jars.find((item) => item.id !== jar.id)?.id || "" }));
    }
    setPendingJarDelete(null);
    setToast(
      isUnassignedChoice && (relatedTransactions.length > 0 || jar.balance > 0)
        ? `Đã xóa hũ ${jar.name}. Còn thừa ${formatCurrency(jar.balance, currency)} chưa được cộng vào hũ nào — hãy chỉnh lại ${jar.percentage}% phân bổ còn thiếu trước khi lưu.`
        : (relatedTransactions.length > 0 || jar.balance > 0) && targetJar
          ? `Đã gộp hũ ${jar.name} vào ${targetJar.name}: chuyển ${jar.percentage}%, ${formatCurrency(jar.balance, currency)} còn lại và ${relatedTransactions.length} giao dịch.`
          : `Đã xóa hũ ${jar.name}. Hãy chỉnh lại ${jar.percentage}% phân bổ còn thiếu trước khi lưu.`
    );
  }

  function editJar(jar: Jar) {
    setEditingId(jar.id);
    setDraft({
      name: jar.name,
      emoji: jar.emoji,
      percentage: jar.percentage,
      amountInput: formatFinanceInput(String(jar.monthlyAllocation)),
      purposeNote: jar.purposeNote,
    });
    setJarInputMode("percent");
  }

  function saveChanges() {
    if (totalPct > 100) {
      setToast(`Không thể lưu vì tổng tỷ lệ đang vượt ${totalPct - 100}%.`);
      return;
    }
    if (totalPct < 100) {
      setShowConfirmRemainder(true);
      return;
    }
    setSavedJars(jars);
    setSavedTransactions(transactions);
    setToast("Đã lưu thông tin hũ.");
  }

  function saveWithRemainderJar() {
    const remainderPct = 100 - totalPct;
    if (remainderPct <= 0) return;
    const monthlyAllocation = Math.round((salary * remainderPct) / 100);
    const nextJars = [
      ...jars,
      {
        id: `remainder-${Date.now()}`,
        name: "Tiền thừa",
        emoji: "💵",
        percentage: remainderPct,
        balance: monthlyAllocation,
        monthlyAllocation,
        purposeNote: "Phần % chưa phân bổ, được hệ thống tự tạo.",
        linkedGoals: ["Tự động tạo"],
      },
    ];
    setJars(nextJars);
    setSavedJars(nextJars);
    setSavedTransactions(transactions);
    setShowConfirmRemainder(false);
    setToast(`Đã tạo hũ Tiền thừa ${remainderPct}% và lưu cấu hình.`);
  }

  function addTransaction() {
    const amount = parseFinanceAmount(txDraft.amount);
    if (!txDraft.jarId || !txDraft.itemName.trim() || !txDraft.spentAt || !Number.isFinite(amount) || amount <= 0) {
      setToast("Vui lòng nhập đủ hũ, tên sản phẩm/dịch vụ, số tiền và thời gian.");
      return;
    }

    const jar = jars.find((item) => item.id === txDraft.jarId);
    if (!jar) {
      setToast("Không tìm thấy hũ đã chọn.");
      return;
    }

    const editingTx = editingTxId ? transactions.find((tx) => tx.id === editingTxId) : null;
    const targetJarBalance = jar.balance + (editingTx?.jarId === txDraft.jarId ? (editingTx.type === "expense" ? editingTx.amount : -editingTx.amount) : 0);

    if (txDraft.type === "expense" && amount > targetJarBalance) {
      setToast(`Hũ ${jar.name} không đủ số dư để ghi chi ${formatCurrency(amount, currency)}.`);
      return;
    }

    const tx: Transaction = {
      id: editingTxId || `tx-${Date.now()}`,
      jarId: txDraft.jarId,
      type: txDraft.type,
      amount,
      itemName: txDraft.itemName.trim(),
      spentAt: txDraft.spentAt,
      note: txDraft.note.trim(),
    };

    setTransactions((prev) => (editingTxId ? prev.map((item) => (item.id === editingTxId ? tx : item)) : [tx, ...prev]));
    setJars((prev) =>
      prev.map((item) => {
        let nextBalance = item.balance;
        let nextAllocation = item.monthlyAllocation;
        if (editingTx && item.id === editingTx.jarId) {
          nextBalance += editingTx.type === "expense" ? editingTx.amount : -editingTx.amount;
          if (editingTx.type === "income") nextAllocation = Math.max(0, nextAllocation - editingTx.amount);
        }
        if (item.id === txDraft.jarId) {
          nextBalance += txDraft.type === "expense" ? -amount : amount;
          if (txDraft.type === "income") nextAllocation += amount;
        }
        return { ...item, balance: Math.max(0, nextBalance), monthlyAllocation: nextAllocation };
      })
    );
    setTxDraft((prev) => ({ ...prev, itemName: "", amount: "", note: "", spentAt: new Date().toISOString().slice(0, 16) }));
    setEditingTxId(null);
    setToast(editingTxId ? "Đã cập nhật giao dịch và số dư hũ." : txDraft.type === "expense" ? "Đã ghi chi và trừ số dư hũ." : "Đã ghi thu và cộng vào số dư hũ.");
  }

  function editTransaction(tx: Transaction) {
    setEditingTxId(tx.id);
    setTxDraft({
      jarId: tx.jarId,
      type: tx.type,
      itemName: tx.itemName,
      amount: currency === "USD" ? String(tx.amount) : Math.round(tx.amount).toLocaleString("vi-VN"),
      spentAt: tx.spentAt,
      note: tx.note,
    });
  }

  function cancelEditTransaction() {
    setEditingTxId(null);
    setTxDraft((prev) => ({ ...prev, itemName: "", amount: "", note: "", spentAt: new Date().toISOString().slice(0, 16) }));
  }

  function requestDeleteTransaction(tx: Transaction) {
    setPendingTxDelete(tx);
  }

  function confirmDeleteTransaction() {
    if (!pendingTxDelete) return;
    const tx = pendingTxDelete;
    setTransactions((prev) => prev.filter((item) => item.id !== tx.id));
    setJars((prev) =>
      prev.map((jar) =>
        jar.id === tx.jarId
          ? {
              ...jar,
              balance: Math.max(0, jar.balance + (tx.type === "expense" ? tx.amount : -tx.amount)),
              monthlyAllocation: tx.type === "income" ? Math.max(0, jar.monthlyAllocation - tx.amount) : jar.monthlyAllocation,
            }
          : jar
      )
    );
    if (editingTxId === tx.id) cancelEditTransaction();
    setPendingTxDelete(null);
    setToast("Đã xóa giao dịch và cập nhật lại số dư hũ.");
  }

  return (
    <main className="p-4 grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
      <Glass className="p-5 xl:sticky xl:top-20 xl:self-start">
        <div ref={jarEditorRef}>
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="h-4 w-4 text-emerald-600" />
          <div>
            <Mono className="text-emerald-700">Custom Jar Manager</Mono>
            <h1 className="text-lg font-bold text-slate-900">Cấu trúc hũ</h1>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white/75 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Tổng tiền cả tháng</p>
                <p className="mt-1 text-xl font-black text-slate-900">{formatCurrency(monthlyTotal, currency)}</p>
              </div>
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-[11px] font-bold uppercase text-emerald-700">Thu nhập chính</p>
                <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(primaryIncome, currency)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">Chu cấp thêm</p>
                <p className="mt-1 text-sm font-black text-slate-900">{formatCurrency(monthlySupportTotal, currency)}</p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Chu cấp thêm được tính từ tổng các giao dịch Thu trong danh sách chi tiêu.</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white/70 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">Đã phân bổ</span>
            <span className={`text-sm font-bold ${totalPct === 100 ? "text-emerald-700" : "text-amber-600"}`}>{totalPct}%</span>
          </div>
          <Progress value={totalPct} tone={totalPct === 100 ? "bg-emerald-500" : "bg-amber-400"} />
          <p className="text-xs text-slate-500 mt-2">{totalPct === 100 ? "Sẵn sàng dùng cho Decision Engine." : `Còn ${remaining}% chưa phân bổ.`}</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-[72px_1fr] gap-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Icon</span>
              <input value={draft.emoji} onChange={(event) => setDraft((prev) => ({ ...prev, emoji: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Tên hũ</span>
              <input value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="VD: Sinh hoạt, Đầu tư..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Cách nhập lượng tiền</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setJarInputMode("percent")}
                className={`flex-1 h-9 rounded-lg border text-xs font-bold transition ${jarInputMode === "percent" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500"}`}
              >
                Theo %
              </button>
              <button
                type="button"
                onClick={() => setJarInputMode("amount")}
                className={`flex-1 h-9 rounded-lg border text-xs font-bold transition ${jarInputMode === "amount" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-500"}`}
              >
                Theo số tiền
              </button>
            </div>
          </div>
          {jarInputMode === "percent" ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Phần trăm lượng tiền (%)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={draft.percentage}
                onChange={(event) => {
                  const pct = Number(event.target.value);
                  setDraft((prev) => ({ ...prev, percentage: pct, amountInput: formatFinanceInput(String(Math.round((salary * pct) / 100))) }));
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              />
              <p className="text-xs text-slate-400">≈ {formatCurrency(Math.round((salary * draft.percentage) / 100), currency)}/tháng</p>
            </label>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Số tiền / tháng</span>
              <input
                inputMode="decimal"
                value={draft.amountInput}
                onChange={(event) => {
                  const formatted = formatFinanceInput(event.target.value);
                  const amount = parseFinanceAmount(formatted);
                  const pct = salary > 0 ? Math.round(((amount / salary) * 100) * 100) / 100 : 0;
                  setDraft((prev) => ({ ...prev, amountInput: formatted, percentage: pct }));
                }}
                placeholder={currency === "USD" ? "VD: 350.00" : "VD: 3.150.000"}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
              />
              <p className="text-xs text-slate-400">≈ {draft.percentage}% thu nhập</p>
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">Ghi chú mục đích cho AI</span>
            <textarea
              value={draft.purposeNote}
              onChange={(event) => setDraft((prev) => ({ ...prev, purposeNote: event.target.value }))}
              placeholder="Mô tả mục đích sử dụng hũ này để AI hiểu và ra quyết định chính xác hơn..."
              rows={7}
              className="min-h-[136px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none"
            />
          </label>
          <button onClick={addJar} disabled={!editingId && remaining <= 0} className="w-full h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40">
            <Plus className="h-4 w-4" />
            {editingId ? "Cập nhật hũ" : "Thêm hũ"}
          </button>
          {editingId && (
            <button onClick={resetDraft} className="w-full h-9 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600">
              Hủy chỉnh sửa
            </button>
          )}
          <div className={`rounded-2xl border p-4 ${noteState.tone}`}>
            <div className="flex items-start gap-2">
              <noteState.icon className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold">{noteState.title}</p>
                <p className="text-xs leading-relaxed mt-1">{noteState.text}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 shadow-sm">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Gợi ý cấu trúc hũ</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Nên có một hũ <b>Ăn uống</b> chiếm tỷ lệ cao nhất để kiểm soát bữa ăn hằng ngày, một hũ <b>Sức khỏe</b> cho gym/khám/thực phẩm hỗ trợ, một hũ <b>Tiết kiệm</b> để giữ an toàn dòng tiền và một hũ <b>Đầu tư</b> cho mục tiêu dài hạn.
                </p>
              </div>
            </div>
          </div>
        </div>
        </div>
      </Glass>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {jars.map((jar) => {
          const used = jar.monthlyAllocation > 0 ? Math.round((jar.balance / jar.monthlyAllocation) * 100) : 0;
          const isEditingThisJar = editingId === jar.id;
          const dimWhileEditing = Boolean(editingId) && !isEditingThisJar;
          const fixedFoodJar = isFixedFoodJar(jar);
          return (
            <Glass
              key={jar.id}
              data-jar-edit-surface={isEditingThisJar ? "true" : undefined}
              className={`p-5 transition-all duration-200 hover:-translate-y-2 hover:scale-[1.015] hover:border-emerald-300 hover:shadow-[0_22px_46px_rgba(15,23,42,0.18)] ${
                isEditingThisJar ? "relative z-10 ring-2 ring-emerald-400 bg-white scale-[1.02] shadow-[0_24px_52px_rgba(16,185,129,0.22)]" : ""
              } ${dimWhileEditing ? "opacity-35 brightness-75 grayscale bg-slate-900/20" : ""}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-xl">{jar.emoji}</div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{jar.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                        {jar.percentage}%
                      </span>
                      <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-black text-slate-700">
                        {formatCurrency(jar.monthlyAllocation, currency)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button data-jar-edit-control="true" onClick={() => editJar(jar)} className="h-8 w-8 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 flex items-center justify-center" title="Chỉnh sửa hũ">
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeJar(jar.id)}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center ${fixedFoodJar ? "cursor-not-allowed text-slate-300" : "hover:bg-rose-50 text-slate-400 hover:text-rose-500"}`}
                    title={fixedFoodJar ? "Hũ Ăn uống là hũ cố định, không thể xóa" : "Xóa hũ"}
                    aria-disabled={fixedFoodJar}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <Progress value={used} tone={used < 30 ? "bg-rose-400" : "bg-emerald-500"} />
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">{formatCurrency(jar.balance, currency)} còn</span>
                <span className="text-slate-400">{used}%</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600 mt-3">{jar.purposeNote}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {jar.linkedGoals.map((goal) => (
                  <span key={goal} className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">{goal}</span>
                ))}
              </div>
            </Glass>
          );
        })}
        <Glass className="p-5 lg:col-span-2">
          <div ref={transactionFormRef}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <Mono className="text-emerald-700">Free Manual Logging</Mono>
              <h2 className="text-lg font-bold text-slate-900">Danh sách chi tiêu</h2>
              <p className="text-xs text-slate-500 mt-1">Bản Free: tự nhập giao dịch, MagerLife tự cập nhật số dư hũ.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[150px_1fr_150px_190px] gap-3 mb-3">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Loại giao dịch</span>
              <select value={txDraft.type} onChange={(event) => setTxDraft((prev) => ({ ...prev, type: event.target.value as "expense" | "income" }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                <option value="expense">Chi tiêu</option>
                <option value="income">Thu nhập</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Chọn hũ liên kết</span>
              <select value={txDraft.jarId} onChange={(event) => setTxDraft((prev) => ({ ...prev, jarId: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                {jars.map((jar) => (
                  <option key={jar.id} value={jar.id}>{jar.emoji} {jar.name}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Số tiền</span>
              <input inputMode="decimal" value={txDraft.amount} onChange={(event) => setTxDraft((prev) => ({ ...prev, amount: formatFinanceInput(event.target.value) }))} placeholder={currency === "USD" ? "VD: 120.50" : "VD: 52.000"} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Thời gian</span>
              <input type="datetime-local" value={txDraft.spentAt} onChange={(event) => setTxDraft((prev) => ({ ...prev, spentAt: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_140px] gap-3 mb-5">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Tên sản phẩm/dịch vụ chi tiêu</span>
              <input value={txDraft.itemName} onChange={(event) => setTxDraft((prev) => ({ ...prev, itemName: event.target.value }))} placeholder="VD: Bữa trưa, tiền điện, khóa học..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-500">Ghi chú</span>
              <input value={txDraft.note} onChange={(event) => setTxDraft((prev) => ({ ...prev, note: event.target.value }))} placeholder="VD: liên quan meal plan, chi cố định, phát sinh..." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none" />
            </label>
            <button onClick={addTransaction} className="self-end h-10 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700">
              {editingTxId ? "Cập nhật" : "Ghi giao dịch"}
            </button>
          </div>
          {editingTxId && (
            <button onClick={cancelEditTransaction} className="mb-5 h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Hủy sửa giao dịch
            </button>
          )}
          </div>

          <div className="hidden lg:grid grid-cols-[88px_1.4fr_56px_1fr_165px_150px_78px] gap-3 px-5 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            <span className="text-center">Loại</span>
            <span>Sản phẩm / dịch vụ</span>
            <span className="text-center">Icon</span>
            <span className="text-center">Tên hũ</span>
            <span className="text-center">Thời gian</span>
            <span className="text-right">Số tiền</span>
            <span className="text-center">Sửa</span>
          </div>

          <div className="space-y-5">
            {transactions.map((tx, index) => {
              const jar = jars.find((item) => item.id === tx.jarId);
              const isExpense = tx.type === "expense";
              const isEditingThisTx = editingTxId === tx.id;
              const dimWhileEditingTx = Boolean(editingTxId) && !isEditingThisTx;
              return (
                <div
                  key={tx.id}
                  data-tx-edit-surface={isEditingThisTx ? "true" : undefined}
                  className={`grid grid-cols-1 lg:grid-cols-[88px_1.4fr_56px_1fr_165px_150px_78px] items-center gap-3 rounded-3xl border p-4 lg:p-5 transition-all duration-200 hover:-translate-y-1 hover:scale-[1.006] hover:shadow-[8px_12px_0_rgba(15,23,42,0.78)] ${
                    isEditingThisTx
                      ? "relative z-10 border-emerald-500 bg-white scale-[1.015] shadow-[0_24px_52px_rgba(16,185,129,0.25)]"
                      : index % 2 === 0
                        ? "border-slate-900 bg-white shadow-[6px_8px_0_rgba(15,23,42,0.88)]"
                        : "border-slate-900 bg-[#fff4df] shadow-[6px_8px_0_rgba(15,23,42,0.88)]"
                  } ${dimWhileEditingTx ? "opacity-30 brightness-50 grayscale bg-slate-900/30" : ""}`}
                >
                  <div className="flex justify-center">
                    <span className={`inline-flex min-w-[64px] justify-center rounded-2xl border px-3 py-2 text-sm font-black ${isExpense ? "border-[#ff7f7f] bg-[#FFCBCB] text-[#7f1010]" : "border-[#65e9b6] bg-[#9BFFD8] text-[#065f46]"}`}>
                      {isExpense ? "Chi" : "Thu"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-black text-slate-950 truncate">{tx.itemName}</p>
                    {tx.note && <p className="mt-1 text-xs font-semibold text-slate-500 truncate">{tx.note}</p>}
                  </div>
                  <div className="flex justify-center">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white border border-slate-200 text-lg shadow-sm">
                      {jar?.emoji || "?"}
                    </span>
                  </div>
                  <div className="text-center text-sm font-black text-slate-800 truncate">
                    {jar?.name || "Hũ đã xóa"}
                  </div>
                  <div className="text-center text-xs font-semibold text-slate-400">
                    {new Date(tx.spentAt).toLocaleString("vi-VN")}
                  </div>
                  <div className={`text-left lg:text-right text-base font-black ${isExpense ? "text-[#d12d2d]" : "text-[#047857]"}`}>
                    {isExpense ? "-" : "+"}{formatCurrency(tx.amount, currency)}
                  </div>
                  <div className="flex justify-center gap-1">
                    <button data-tx-edit-control="true" onClick={() => editTransaction(tx)} className="h-8 w-8 rounded-xl bg-white/80 border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center" title="Sửa giao dịch">
                      <Settings className="h-4 w-4" />
                    </button>
                    <button onClick={() => requestDeleteTransaction(tx)} className="h-8 w-8 rounded-xl bg-white/80 border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center" title="Xóa giao dịch">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Glass>
      </div>
      {hasUnsavedChanges && (
        <button onClick={saveChanges} className="fixed bottom-5 right-5 z-50 h-12 rounded-2xl bg-slate-900 px-5 text-sm font-bold text-white shadow-2xl shadow-slate-400/60 flex items-center gap-2 hover:bg-slate-800">
          <Save className="h-4 w-4" />
          Lưu thay đổi
        </button>
      )}
      {toast && (
        <div className="fixed bottom-20 right-5 z-50 max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-xl">
          <div className="flex items-start gap-3">
            <span className="flex-1">{toast}</span>
            <button onClick={() => setToast("")} className="text-slate-400 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {pendingTxDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Mono className="text-rose-600">Xóa giao dịch</Mono>
                <h3 className="text-lg font-bold text-slate-900">Xóa “{pendingTxDelete.itemName}”?</h3>
              </div>
              <button onClick={() => setPendingTxDelete(null)} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Hũ liên kết</span>
                <span className="font-bold text-slate-900">{pendingTxDeleteJar?.name || "Hũ đã xóa"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Số tiền</span>
                <span className={`font-black ${pendingTxDelete.type === "expense" ? "text-rose-600" : "text-emerald-700"}`}>
                  {pendingTxDelete.type === "expense" ? "-" : "+"}{formatCurrency(pendingTxDelete.amount, currency)}
                </span>
              </div>
              {pendingTxDeleteJar && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Số dư sau khi xóa</span>
                  <span className="font-bold text-slate-900">{formatCurrency(pendingTxDeleteNextBalance, currency)}</span>
                </div>
              )}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Giao dịch sẽ bị xóa khỏi danh sách và số dư hũ liên kết sẽ được cập nhật lại.
            </p>

            <div className="mt-5 flex gap-2">
              <button onClick={() => setPendingTxDelete(null)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">
                Giữ lại
              </button>
              <button onClick={confirmDeleteTransaction} className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white">
                Xóa giao dịch
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingJarDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Mono className="text-rose-600">Xóa hũ</Mono>
                <h3 className="text-lg font-bold text-slate-900">
                  Xóa hũ {pendingJarDelete.jar.emoji} {pendingJarDelete.jar.name}?
                </h3>
              </div>
              <button onClick={() => setPendingJarDelete(null)} className="h-8 w-8 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Tỷ lệ</p>
                <p className="mt-1 text-sm font-black text-slate-900">{pendingJarDelete.jar.percentage}%</p>
                <p className="mt-1 text-xs text-slate-500">Sau khi xóa còn {pendingJarNextPct}%.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Giao dịch</p>
                <p className="mt-1 text-sm font-black text-slate-900">{pendingJarDelete.relatedTransactions.length}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Chi {formatCurrency(pendingJarExpenseTotal, currency)} · Thu {formatCurrency(pendingJarIncomeTotal, currency)}.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-bold uppercase text-slate-400">Số dư còn</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {formatCurrency(pendingJarDelete.jar.balance, currency)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Sẽ chuyển sang hũ nhận.</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-bold text-amber-900">Lưu ý trước khi xóa</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                Khi chuyển sang hũ khác, MagerLife sẽ gộp cả {pendingJarDelete.jar.percentage}% phân bổ và hạn mức {formatCurrency(pendingJarDelete.jar.monthlyAllocation, currency)} để tỷ lệ còn lại không vượt 100%.
              </p>
            </div>

            {pendingJarNeedsTransfer && (
              <label className="mt-4 block space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">Chuyển số dư và lịch sử sang hũ khác</span>
                <select
                  value={pendingJarDelete.targetJarId}
                  onChange={(event) => setPendingJarDelete((prev) => (prev ? { ...prev, targetJarId: event.target.value } : prev))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                >
                  <option value={UNASSIGNED_JAR_TARGET}>🤷 Chưa chọn</option>
                  {pendingJarDeleteOptions.map((jar) => (
                    <option key={jar.id} value={jar.id}>
                      {jar.emoji} {jar.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-relaxed text-slate-500">
                  {pendingJarDelete.targetJarId === UNASSIGNED_JAR_TARGET
                    ? `MagerLife sẽ không cộng ${formatCurrency(pendingJarDelete.jar.balance, currency)} còn lại vào hũ nào — chỉ báo cho bạn đây là khoản tiền thừa chưa phân bổ. Các giao dịch cũ vẫn được giữ lại nhưng bỏ liên kết hũ.`
                    : `MagerLife sẽ cộng ${formatCurrency(pendingJarDelete.jar.balance, currency)} còn lại, gộp ${pendingJarDelete.jar.percentage}% phân bổ, giữ các giao dịch này, đổi hũ liên kết, và thêm ghi chú "chuyển từ hũ ${pendingJarDelete.jar.name}".`}
                </p>
              </label>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={() => setPendingJarDelete(null)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">
                Giữ lại
              </button>
              <button
                onClick={confirmDeleteJar}
                disabled={pendingJarNeedsTransfer && !pendingJarDelete.targetJarId}
                className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Xóa hũ
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirmRemainder && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900">Còn thiếu {remaining}%</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Tổng tỷ lệ hiện nhỏ hơn 100%. Bạn có muốn MagerLife tự tạo hũ "Tiền thừa" với {remaining}% còn lại rồi lưu không?
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowConfirmRemainder(false)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600">
                Chỉnh lại
              </button>
              <button onClick={saveWithRemainderJar} className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white">
                Tạo và lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
