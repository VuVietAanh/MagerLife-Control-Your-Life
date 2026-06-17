
  import React from "react";
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

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

  createRoot(document.getElementById("root")!).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
  
