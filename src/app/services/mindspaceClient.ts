import { MAGERLIFE_API_BASE_URL, MINDSPACE_API_BASE_URL } from "./apiConfig";
import { getAuthSessionToken } from "./authSessionService";

// Client cho MindSpace ("Tâm sự"). Đăng nhập chỉ ở MagerLife: client đổi phiên MagerLife lấy
// token MindSpace ngắn hạn (POST /mindspace/token phía Node), giữ trong bộ nhớ, và xin lại
// khi sắp hết hạn hoặc khi MindSpace trả 401.

export type MindspaceResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; code?: string; retryAfter?: number };

export type MindspacePinStatus = { has_pin: boolean; locked: boolean; pin_length: number };
export type MindspaceUnlock = { unlock_token: string; expires_in: number };

export type MindspaceConversation = {
  conversation_id: string;
  name_conversation: string | null;
  message_count: number;
  started_at: string | null;
  last_message_at: string | null;
};

export type MindspaceMessage = {
  role: "user" | "bot";
  content: string;
  timestamp: string | null;
  crisis_flagged?: boolean;
};

export type MindspaceChatReply = {
  response: string;
  crisis_level: "none" | "watch" | "alert" | "critical";
  intent: string;
};

export type MindspaceNewConversation = {
  conversation_id: string;
  greeting: string | null;
  returning_prompt: string | null;
  prev_conversation_id: string | null;
};

let cached: { token: string; expiresAtMs: number; forSession: string } | null = null;

async function mindspaceToken(force = false): Promise<string | null> {
  const session = getAuthSessionToken();
  if (!session) return null;
  // Xin lại trước khi hết hạn 1 phút, hoặc khi đã đăng nhập tài khoản khác
  if (!force && cached && cached.forSession === session && cached.expiresAtMs - Date.now() > 60_000) return cached.token;
  try {
    const response = await fetch(`${MAGERLIFE_API_BASE_URL.replace(/\/$/, "")}/mindspace/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session}` },
      body: "{}",
    });
    if (!response.ok) return null;
    const data = await response.json();
    cached = { token: data.token, expiresAtMs: Date.parse(data.expiresAt), forSession: session };
    return cached.token;
  } catch {
    return null;
  }
}

// Mã mở khoá PIN: chỉ giữ trong bộ nhớ (không localStorage), nên tải lại trang là phải nhập PIN lại.
let unlock: { token: string; expiresAtMs: number } | null = null;
const lockListeners = new Set<(code: string) => void>();

export function setMindspaceUnlock(data: MindspaceUnlock) {
  unlock = { token: data.unlock_token, expiresAtMs: Date.now() + data.expires_in * 1000 };
}

export function clearMindspaceUnlock() {
  unlock = null;
}

export function isMindspaceUnlocked() {
  return Boolean(unlock && unlock.expiresAtMs > Date.now());
}

/** Gọi khi server báo cần PIN (mã mở khoá hết hạn hoặc PIN vừa đổi ở nơi khác). */
export function onMindspaceLocked(listener: (code: string) => void) {
  lockListeners.add(listener);
  return () => {
    lockListeners.delete(listener);
  };
}

export function clearMindspaceToken() {
  cached = null;
  unlock = null;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<MindspaceResult<T>> {
  const url = `${MINDSPACE_API_BASE_URL.replace(/\/$/, "")}${path}`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await mindspaceToken(attempt > 0);
    if (!token) return { ok: false, status: 401, message: "Không lấy được quyền truy cập Tâm sự. Thử đăng nhập lại." };
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(unlock && unlock.expiresAtMs > Date.now() ? { "X-Mindspace-Unlock": unlock.token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return { ok: false, status: 0, message: "Không kết nối được Tâm sự. Kiểm tra mạng rồi thử lại." };
    }
    if (response.status === 401 && attempt === 0) continue; // token hết hạn: xin token mới, thử lại một lần
    if (!response.ok) {
      let message = `Lỗi ${response.status}`;
      let code: string | undefined;
      let retryAfter: number | undefined;
      try {
        const payload = await response.json();
        const detail = payload?.detail;
        if (typeof detail === "string") message = detail;
        else if (detail && typeof detail === "object") {
          if (typeof detail.message === "string") message = detail.message;
          if (typeof detail.code === "string") code = detail.code;
          if (typeof detail.retry_after === "number") retryAfter = detail.retry_after;
        }
      } catch {
        /* giữ thông báo mặc định */
      }
      if (response.status === 423) {
        unlock = null;
        lockListeners.forEach((listener) => listener(code || "PIN_REQUIRED"));
      }
      return { ok: false, status: response.status, message, code, retryAfter };
    }
    return { ok: true, data: (await response.json()) as T };
  }
  return { ok: false, status: 401, message: "Phiên Tâm sự hết hạn. Thử đăng nhập lại." };
}

export const mindspaceApi = {
  me: () => request<{ user_id: string; name: string | null; email: string }>("GET", "/api/auth/me"),
  newConversation: (userId: string) => request<MindspaceNewConversation>("POST", "/api/conversation/new", { user_id: userId }),
  conversations: (userId: string) => request<MindspaceConversation[]>("GET", `/api/conversations/${encodeURIComponent(userId)}`),
  messages: (conversationId: string) => request<MindspaceMessage[]>("GET", `/api/conversation/${encodeURIComponent(conversationId)}/messages`),
  chat: (userId: string, conversationId: string, message: string) =>
    request<MindspaceChatReply>("POST", "/api/chat", { user_id: userId, conversation_id: conversationId, message }),
  rename: (conversationId: string, name: string) => request<unknown>("PUT", `/api/conversation/${encodeURIComponent(conversationId)}/rename`, { name }),
  remove: (conversationId: string) => request<unknown>("DELETE", `/api/conversation/${encodeURIComponent(conversationId)}`),
  backgrounds: () => request<{ images: string[] }>("GET", "/api/backgrounds"),
  pinStatus: () => request<MindspacePinStatus>("GET", "/api/pin/status"),
  setPin: (pin: string, currentPin?: string) =>
    request<MindspaceUnlock>("POST", "/api/pin/set", currentPin ? { pin, current_pin: currentPin } : { pin }),
  verifyPin: (pin: string) => request<MindspaceUnlock>("POST", "/api/pin/verify", { pin }),
};

export function mindspaceBackgroundUrl(name: string) {
  return `${MINDSPACE_API_BASE_URL.replace(/\/$/, "")}/static/backgrounds/${encodeURIComponent(name)}`;
}
