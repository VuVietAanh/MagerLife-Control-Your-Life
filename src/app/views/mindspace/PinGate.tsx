import { Eye, EyeOff, KeyRound, Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { mindspaceApi, setMindspaceUnlock } from "../../services/mindspaceClient";

const PIN_LENGTH = 8;
const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, PIN_LENGTH);

function PinField({
  label,
  value,
  onChange,
  onEnter,
  autoFocus,
  reveal,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  reveal: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        type={reveal ? "text" : "password"}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        maxLength={PIN_LENGTH}
        value={value}
        onChange={(event) => onChange(onlyDigits(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
        }}
        placeholder={"•".repeat(PIN_LENGTH)}
        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.5em] text-slate-900 outline-none placeholder:text-slate-300 focus:border-emerald-400"
      />
    </label>
  );
}

function RevealToggle({ reveal, onToggle }: { reveal: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
      {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {reveal ? "Ẩn mã" : "Hiện mã"}
    </button>
  );
}

/** Màn hình khoá tab Tâm sự: đặt PIN lần đầu, hoặc nhập PIN để mở. */
export function PinGate({ onUnlocked, notice }: { onUnlocked: () => void; notice?: string }) {
  const [mode, setMode] = useState<"checking" | "setup" | "enter" | "error">("checking");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void mindspaceApi.pinStatus().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.message);
        setMode("error");
        return;
      }
      setMode(result.data.has_pin ? "enter" : "setup");
      if (result.data.locked) setError("Nhập sai quá nhiều lần. Tâm sự đang bị khoá tạm, thử lại sau ít phút.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    if (busy) return;
    setError("");
    if (pin.length !== PIN_LENGTH) {
      setError(`Mã gồm đúng ${PIN_LENGTH} chữ số.`);
      return;
    }
    if (mode === "setup" && pin !== confirm) {
      setError("Hai lần nhập không khớp.");
      return;
    }
    setBusy(true);
    const result = mode === "setup" ? await mindspaceApi.setPin(pin) : await mindspaceApi.verifyPin(pin);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      setPin("");
      setConfirm("");
      return;
    }
    setMindspaceUnlock(result.data);
    onUnlocked();
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex min-h-full items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-white/80 bg-white/90 p-6 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
          <Lock className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-center text-lg font-black text-slate-900">
          {mode === "setup" ? "Đặt mã PIN cho Tâm sự" : "Tâm sự đang khoá"}
        </h2>
        <p className="mt-1 text-center text-sm text-slate-500">
          {mode === "setup"
            ? `Chọn ${PIN_LENGTH} chữ số. Từ giờ, mỗi lần mở Tâm sự sẽ cần mã này.`
            : mode === "checking"
              ? "Đang kiểm tra…"
              : `Nhập mã ${PIN_LENGTH} số để mở.`}
        </p>
        {notice && mode === "enter" && <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-center text-xs text-slate-600">{notice}</p>}

        {(mode === "setup" || mode === "enter") && (
          <div className="mt-5 space-y-3">
            <PinField label={mode === "setup" ? "Mã mới" : "Mã PIN"} value={pin} onChange={setPin} onEnter={() => void submit()} autoFocus reveal={reveal} />
            {mode === "setup" && <PinField label="Nhập lại mã" value={confirm} onChange={setConfirm} onEnter={() => void submit()} reveal={reveal} />}
            <RevealToggle reveal={reveal} onToggle={() => setReveal((v) => !v)} />
            {mode === "setup" && (
              <p className="text-xs leading-relaxed text-slate-500">
                Không dùng mã toàn một số hay dãy liên tiếp (như 12345678). Quên mã thì không tự đặt lại được trong app, nên hãy ghi nhớ kỹ.
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}

        {(mode === "setup" || mode === "enter") && (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="mt-5 h-11 w-full rounded-lg bg-emerald-500 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            {busy ? "Đang kiểm tra…" : mode === "setup" ? "Đặt mã và mở" : "Mở Tâm sự"}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

/** Đổi PIN: cần mã hiện tại. Đổi xong, mọi phiên mở khoá cũ hết hiệu lực. */
export function ChangePinDialog({ onClose }: { onClose: (changed: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy) return;
    setError("");
    if (current.length !== PIN_LENGTH || next.length !== PIN_LENGTH) {
      setError(`Mã gồm đúng ${PIN_LENGTH} chữ số.`);
      return;
    }
    if (next !== confirm) {
      setError("Hai lần nhập mã mới không khớp.");
      return;
    }
    setBusy(true);
    const result = await mindspaceApi.setPin(next, current);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMindspaceUnlock(result.data);
    onClose(true);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ms-change-pin-title">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 id="ms-change-pin-title" className="flex items-center gap-2 text-base font-bold text-slate-900">
            <KeyRound className="h-4 w-4" />
            Đổi mã PIN
          </h3>
          <button type="button" onClick={() => onClose(false)} className="rounded p-1 hover:bg-slate-100" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <PinField label="Mã hiện tại" value={current} onChange={setCurrent} autoFocus reveal={reveal} />
          <PinField label="Mã mới" value={next} onChange={setNext} reveal={reveal} />
          <PinField label="Nhập lại mã mới" value={confirm} onChange={setConfirm} onEnter={() => void submit()} reveal={reveal} />
          <RevealToggle reveal={reveal} onToggle={() => setReveal((v) => !v)} />
        </div>
        {error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
            Huỷ
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {busy ? "Đang đổi…" : "Đổi mã"}
          </button>
        </div>
      </div>
    </div>
  );
}
