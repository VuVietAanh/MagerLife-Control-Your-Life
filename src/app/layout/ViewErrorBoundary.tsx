import React from "react";
import { Dashboard } from "../views/dashboard/Dashboard";

type ViewErrorBoundaryProps = {
  children: React.ReactNode;
  fallbackTitle: string;
  onReset: () => void;
};

type ViewErrorBoundaryState = {
  message: string;
  stack?: string;
};

export class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      message: error instanceof Error ? error.message : "Không rõ lỗi giao diện.",
      stack: error instanceof Error ? error.stack : "",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("MagerLife view crashed", error);
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <main className="p-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide">Lỗi giao diện</p>
          <h1 className="mt-1 text-lg font-black">{this.props.fallbackTitle}</h1>
          <p className="mt-2 text-sm font-semibold">{this.state.message}</p>
          {this.state.stack && (
            <pre className="mt-3 max-h-44 overflow-auto rounded-xl bg-white/80 p-3 text-xs text-rose-700">
              {this.state.stack}
            </pre>
          )}
          <button
            onClick={() => {
              this.setState({ message: "", stack: "" });
              this.props.onReset();
            }}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Quay về Dashboard
          </button>
        </div>
      </main>
    );
  }
}
