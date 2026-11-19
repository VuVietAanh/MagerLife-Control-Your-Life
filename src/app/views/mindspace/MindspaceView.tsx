import { Image as ImageIcon, List, Phone, Send, Trash2, X } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  mindspaceApi,
  mindspaceBackgroundUrl,
  type MindspaceConversation,
} from "../../services/mindspaceClient";
import { Glass } from "../../ui/primitives";
import { ConversationList, conversationTitle } from "./ConversationList";

type ChatMessage = { role: "user" | "bot"; content: string; timestamp: string | null; crisis?: boolean };

const BACKGROUND_STORAGE_KEY = "magerlife.mindspace.background.v1";

function readStoredBackground() {
  try {
    return window.localStorage.getItem(BACKGROUND_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

// Chỉ hỗ trợ **đậm** và xuống dòng; không dùng innerHTML.
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, lineIndex) => (
        <React.Fragment key={lineIndex}>
          {lineIndex > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
            part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : part
          )}
        </React.Fragment>
      ))}
    </>
  );
}

function HotlineCard() {
  return (
    <div className="mt-2 max-w-[86%] rounded-lg border border-rose-200 bg-rose-50/95 px-3 py-2 text-xs text-rose-900">
      <p className="flex items-center gap-1.5 font-bold">
        <Phone className="h-3.5 w-3.5" />
        Nếu bạn đang gặp nguy hiểm
      </p>
      <p className="mt-1 leading-relaxed">
        Gọi <a href="tel:115" className="font-bold underline">115</a> (cấp cứu, 24/7) hoặc báo ngay cho một người ở gần bạn.
        Đường dây Ngày Mai: <a href="tel:0963061414" className="font-bold underline">096 306 1414</a> (13:00–20:30, Thứ Tư đến Chủ Nhật).
      </p>
    </div>
  );
}

export function MindspaceView() {
  const [userId, setUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<MindspaceConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [returning, setReturning] = useState<{ prompt: string; prevId: string } | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showList, setShowList] = useState(false);
  const [backgrounds, setBackgrounds] = useState<string[]>([]);
  const [background, setBackground] = useState(readStoredBackground);
  const [showBackgrounds, setShowBackgrounds] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MindspaceConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const refreshList = useCallback(async (uid: string) => {
    const result = await mindspaceApi.conversations(uid);
    if (result.ok) setConversations(result.data);
  }, []);

  const startNew = useCallback(
    async (uid: string, offerReturning: boolean) => {
      setError("");
      const result = await mindspaceApi.newConversation(uid);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setActiveId(result.data.conversation_id);
      setMessages(result.data.greeting ? [{ role: "bot", content: result.data.greeting, timestamp: null }] : []);
      setReturning(
        offerReturning && result.data.returning_prompt && result.data.prev_conversation_id
          ? { prompt: result.data.returning_prompt, prevId: result.data.prev_conversation_id }
          : null
      );
      setShowList(false);
      await refreshList(uid);
    },
    [refreshList]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await mindspaceApi.me();
      if (cancelled) return;
      if (!me.ok) {
        setError(me.message);
        setLoading(false);
        return;
      }
      setUserId(me.data.user_id);
      await startNew(me.data.user_id, true);
      const images = await mindspaceApi.backgrounds();
      if (!cancelled && images.ok) setBackgrounds(images.data.images);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [startNew]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function openConversation(id: string) {
    setError("");
    setReturning(null);
    setShowList(false);
    const result = await mindspaceApi.messages(id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setActiveId(id);
    setMessages(result.data.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp, crisis: m.role === "bot" && m.crisis_flagged })));
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || !userId || !activeId) return;
    setError("");
    setReturning(null);
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: text, timestamp: new Date().toISOString() }]);
    const result = await mindspaceApi.chat(userId, activeId, text);
    setSending(false);
    if (!result.ok) {
      // Bỏ tin vừa thêm và trả chữ về ô nhập để gửi lại
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
      setError(result.message);
      return;
    }
    setMessages((prev) => [
      ...prev,
      { role: "bot", content: result.data.response, timestamp: new Date().toISOString(), crisis: result.data.crisis_level === "critical" },
    ]);
    void refreshList(userId);
  }

  async function renameConversation(conversation: MindspaceConversation, name: string) {
    if (!userId) return;
    // Hiện tên mới ngay; lỗi thì danh sách tải lại sẽ trả về tên cũ
    setConversations((prev) => prev.map((c) => (c.conversation_id === conversation.conversation_id ? { ...c, name_conversation: name } : c)));
    const result = await mindspaceApi.rename(conversation.conversation_id, name);
    if (!result.ok) {
      setError(`Không đổi được tên: ${result.message}`);
      await refreshList(userId);
    }
  }

  async function confirmDelete() {
    const conversation = pendingDelete;
    if (!conversation || !userId) return;
    setDeleting(true);
    const result = await mindspaceApi.remove(conversation.conversation_id);
    setDeleting(false);
    setPendingDelete(null);
    if (!result.ok) {
      setError(`Không xoá được: ${result.message}`);
      return;
    }
    if (conversation.conversation_id === activeId) await startNew(userId, false);
    else await refreshList(userId);
  }

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !deleting && setPendingDelete(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, deleting]);

  function chooseBackground(name: string) {
    setBackground(name);
    setShowBackgrounds(false);
    try {
      if (name) window.localStorage.setItem(BACKGROUND_STORAGE_KEY, name);
      else window.localStorage.removeItem(BACKGROUND_STORAGE_KEY);
    } catch {
      /* lựa chọn chỉ không được nhớ */
    }
  }

  const backgroundStyle: React.CSSProperties = background
    ? {
        backgroundImage: `linear-gradient(rgba(15,23,42,0.35), rgba(15,23,42,0.35)), url("${mindspaceBackgroundUrl(background)}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {};

  const list = (
    <ConversationList
      conversations={conversations}
      activeId={activeId}
      onSelect={(id) => void openConversation(id)}
      onNew={() => userId && void startNew(userId, false)}
      onRename={(c, name) => void renameConversation(c, name)}
      onDelete={(c) => setPendingDelete(c)}
    />
  );

  return (
    <main className="p-4">
      <Glass className="relative flex h-[calc(100vh-7.5rem)] min-h-[480px] overflow-hidden">
        <aside className="hidden w-64 shrink-0 border-r border-white/70 bg-white/40 md:block">{list}</aside>
        {showList && (
          <div className="absolute inset-0 z-20 flex md:hidden">
            <aside className="w-72 max-w-[85%] bg-white/95 shadow-xl">{list}</aside>
            <button type="button" aria-label="Đóng danh sách" className="flex-1 bg-slate-900/30" onClick={() => setShowList(false)} />
          </div>
        )}

        <section className="relative flex min-w-0 flex-1 flex-col" style={backgroundStyle}>
          <div className="flex items-center justify-between border-b border-white/60 bg-white/55 px-4 py-2 backdrop-blur">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowList(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-white md:hidden" title="Danh sách">
                <List className="h-4 w-4" />
              </button>
              <p className="text-sm font-bold text-slate-900">Tâm sự</p>
            </div>
            <button type="button" onClick={() => setShowBackgrounds((v) => !v)} className="rounded-lg p-1.5 text-slate-600 hover:bg-white" title="Đổi ảnh nền">
              <ImageIcon className="h-4 w-4" />
            </button>
          </div>

          {showBackgrounds && (
            <div className="absolute right-3 top-12 z-10 w-72 rounded-lg border border-white/80 bg-white/95 p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-700">Ảnh nền</p>
                <button type="button" onClick={() => setShowBackgrounds(false)} className="rounded p-0.5 hover:bg-slate-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => chooseBackground("")} className={`h-14 rounded border text-[10px] text-slate-500 ${!background ? "ring-2 ring-emerald-500" : ""}`}>
                  Không
                </button>
                {backgrounds.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => chooseBackground(name)}
                    className={`h-14 rounded bg-cover bg-center ${background === name ? "ring-2 ring-emerald-500" : ""}`}
                    style={{ backgroundImage: `url("${mindspaceBackgroundUrl(name)}")` }}
                    title={name}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {loading && <p className="text-center text-xs text-slate-500">Đang mở…</p>}
            {!loading && messages.length === 0 && !returning && !error && (
              <p className={`mt-10 text-center text-sm ${background ? "text-white" : "text-slate-500"}`}>Muốn kể chuyện gì thì cứ viết.</p>
            )}
            {returning && (
              <div className="flex justify-start">
                <div className="max-w-[86%] rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-sm leading-relaxed text-slate-700">
                  <RichText text={returning.prompt} />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => void openConversation(returning.prevId)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">
                      Nói tiếp
                    </button>
                    <button type="button" onClick={() => setReturning(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
                      Chuyện mới
                    </button>
                  </div>
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`flex flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[86%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                    message.role === "user" ? "bg-slate-900 text-white" : "border border-white/80 bg-white/90 text-slate-700"
                  }`}
                >
                  <RichText text={message.content} />
                  {message.timestamp && (
                    <span className={`mt-1 block text-[10px] ${message.role === "user" ? "text-slate-300" : "text-slate-400"}`}>{formatTime(message.timestamp)}</span>
                  )}
                </div>
                {message.crisis && <HotlineCard />}
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-white/80 bg-white/90 px-3.5 py-3" role="status" aria-label="MindSpace đang trả lời">
                  <span className="ms-typing" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            )}
            {error && <p className="rounded-lg bg-rose-50/95 px-3 py-2 text-xs text-rose-700">{error}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-white/60 bg-white/70 px-4 pb-2 pt-3 backdrop-blur">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Nhắn gì đó…"
                disabled={!activeId}
                className="max-h-32 min-h-[38px] min-w-0 flex-1 resize-none rounded-lg border border-white/80 bg-white/90 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !input.trim() || !activeId}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                title="Gửi"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-500">
              Không phải dịch vụ y tế · Khẩn cấp <a href="tel:115" className="font-semibold underline">115</a> · Ngày Mai{" "}
              <a href="tel:0963061414" className="font-semibold underline">096 306 1414</a> (13:00–20:30, T4–CN)
            </p>
          </div>
        </section>
      </Glass>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onMouseDown={(event) => event.target === event.currentTarget && !deleting && setPendingDelete(null)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="ms-delete-title" className="w-full max-w-md rounded-2xl border border-white/80 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <Trash2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 id="ms-delete-title" className="text-lg font-bold text-slate-900">Xoá cuộc trò chuyện?</h3>
                <p className="mt-1 truncate text-sm font-semibold text-slate-700">“{conversationTitle(pendingDelete)}”</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Toàn bộ tin nhắn của cuộc này sẽ bị xoá hẳn khỏi server và không khôi phục được.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                autoFocus
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Giữ lại
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Đang xoá…" : "Xoá hẳn"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
