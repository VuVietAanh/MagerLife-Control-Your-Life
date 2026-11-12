import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type MindspaceConversation } from "../../services/mindspaceClient";

function dayLabel(iso: string | null) {
  if (!iso) return "Trước đó";
  const date = new Date(iso);
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function conversationTitle(conversation: MindspaceConversation) {
  return conversation.name_conversation || (conversation.message_count ? "Cuộc trò chuyện" : "Cuộc mới");
}

// Đổi tên ngay tại dòng: Enter lưu, Esc huỷ, bấm ra ngoài cũng lưu.
function RenameField({ initial, onSave, onCancel }: { initial: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    const name = value.trim();
    if (save && name && name !== initial) onSave(name);
    else onCancel();
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <input
        ref={inputRef}
        value={value}
        maxLength={80}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) finish(true);
          if (event.key === "Escape") finish(false);
        }}
        onBlur={() => finish(true)}
        aria-label="Tên cuộc trò chuyện"
        className="min-w-0 flex-1 rounded border border-emerald-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-200"
      />
      {/* onMouseDown chạy trước onBlur, nên bấm nút không bị blur "lưu" chen ngang */}
      <button type="button" title="Lưu" onMouseDown={(event) => { event.preventDefault(); finish(true); }} className="rounded p-1 text-emerald-700 hover:bg-emerald-50">
        <Check className="h-3 w-3" />
      </button>
      <button type="button" title="Huỷ" onMouseDown={(event) => { event.preventDefault(); finish(false); }} className="rounded p-1 text-slate-500 hover:bg-slate-100">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: MindspaceConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (conversation: MindspaceConversation, name: string) => void;
  onDelete: (conversation: MindspaceConversation) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // Cuộc trống chỉ hiện khi đang mở nó
  const visible = conversations.filter((c) => c.message_count > 0 || c.conversation_id === activeId);
  let lastLabel = "";

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNew}
        className="m-3 flex h-9 items-center justify-center gap-2 rounded-lg bg-slate-900 text-xs font-bold text-white hover:bg-slate-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Cuộc mới
      </button>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {visible.length === 0 && <p className="px-2 py-4 text-xs text-slate-500">Chưa có cuộc trò chuyện nào.</p>}
        {visible.map((conversation) => {
          const label = dayLabel(conversation.last_message_at || conversation.started_at);
          const showLabel = label !== lastLabel;
          lastLabel = label;
          const active = conversation.conversation_id === activeId;
          const editing = conversation.conversation_id === editingId;
          return (
            <div key={conversation.conversation_id}>
              {showLabel && <p className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>}
              <div
                className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-xs ${
                  active || editing ? "bg-white/90 font-bold text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/60"
                }`}
              >
                {editing ? (
                  <RenameField
                    initial={conversation.name_conversation || ""}
                    onSave={(name) => {
                      setEditingId(null);
                      onRename(conversation, name);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.conversation_id)}
                      onDoubleClick={() => conversation.message_count > 0 && setEditingId(conversation.conversation_id)}
                      className="min-w-0 flex-1 truncate text-left"
                      title={conversationTitle(conversation)}
                    >
                      {conversationTitle(conversation)}
                    </button>
                    {conversation.message_count > 0 && (
                      <span className="flex shrink-0 gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
                        <button type="button" title="Đổi tên" onClick={() => setEditingId(conversation.conversation_id)} className="rounded p-1 hover:bg-slate-100">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button type="button" title="Xoá" onClick={() => onDelete(conversation)} className="rounded p-1 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
