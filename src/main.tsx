// src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Router from "./router";
import ErrorBoundary from "./ErrorBoundary";
import "./index.css";

/* === TanStack Query === */
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient, // ★ 追加：Beacon 用
} from "@tanstack/react-query";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                   // まずは控えめ
      refetchOnWindowFocus: false, // 予期せぬ再フェッチを抑止
      staleTime: 0,
    },
  },
});

/* ★ ヘッダ影の強弱をスクロールで切替える */
function ChromeFX() {
  React.useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 2) {
        document.body.classList.add("scrolled");
      } else {
        document.body.classList.remove("scrolled");
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return null;
}

/* ★ Provider 配線確認用（後で削除OK） */
function QueryBeacon() {
  const qc = useQueryClient();
  React.useEffect(() => {
    console.info("[RQ] QueryClient ready:", !!qc);
  }, [qc]);
  return (
    <div
      style={{
        position: "fixed",
        right: 10,
        bottom: 10,
        padding: "6px 10px",
        borderRadius: 8,
        background: "#eef8ee",
        color: "#126b12",
        border: "1px solid #bfe3bf",
        fontSize: 12,
        zIndex: 9999,
      }}
      aria-label="React Query 接続状態"
    >
      ✅ React Query OK
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {/* ★ 影コントローラを全ページで有効化 */}
        <ChromeFX />
        <BrowserRouter>
          <Router />
        </BrowserRouter>
      </ErrorBoundary>
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  </React.StrictMode>
);
