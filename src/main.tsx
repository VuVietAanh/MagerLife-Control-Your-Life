import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showBootError(message: string, stack = "") {
  const root = document.getElementById("root");
  if (!root) return;
  const safeMessage = escapeHtml(message);
  const safeStack = escapeHtml(stack);
  root.innerHTML = `
    <main style="min-height:100vh;background:#fff1f2;color:#881337;padding:24px;font-family:Arial,sans-serif">
      <div style="max-width:900px;margin:0 auto;border:1px solid #fecdd3;background:white;border-radius:16px;padding:20px;box-shadow:0 8px 24px rgba(0,0,0,.08)">
        <p style="margin:0 0 8px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">MagerLife boot error</p>
        <h1 style="margin:0 0 12px;font-size:22px">Không thể khởi động giao diện</h1>
        <p style="margin:0 0 12px;font-size:14px;font-weight:700">${safeMessage}</p>
        ${safeStack ? `<pre style="max-height:360px;overflow:auto;background:#fff1f2;border-radius:12px;padding:12px;font-size:12px;white-space:pre-wrap">${safeStack}</pre>` : ""}
      </div>
    </main>
  `;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { message: string; stack?: string }> {
  state = { message: "", stack: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      message: error instanceof Error ? error.message : "Không rõ lỗi giao diện.",
      stack: error instanceof Error ? error.stack : "",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("MagerLife root crashed", error);
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <main className="min-h-screen bg-rose-50 p-6 font-sans text-rose-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide">MagerLife gặp lỗi giao diện</p>
          <h1 className="mt-2 text-xl font-black">Không thể hiển thị màn hình hiện tại</h1>
          <p className="mt-3 text-sm font-semibold">{this.state.message}</p>
          {this.state.stack && <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-rose-50 p-3 text-xs">{this.state.stack}</pre>}
        </div>
      </main>
    );
  }
}

window.addEventListener("error", (event) => {
  showBootError(event.message || "Lỗi JavaScript khi tải ứng dụng.", event.error?.stack || "");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  showBootError(reason instanceof Error ? reason.message : "Promise bị lỗi khi tải ứng dụng.", reason instanceof Error ? reason.stack || "" : String(reason || ""));
});

async function boot() {
  try {
    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("Không tìm thấy #root trong index.html.");
    const { default: App } = await import("./app/App.tsx");
    createRoot(rootElement).render(
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    );
  } catch (error) {
    showBootError(error instanceof Error ? error.message : "Không thể import App.", error instanceof Error ? error.stack || "" : "");
  }
}

void boot();
