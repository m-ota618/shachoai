// src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import Router from "./router.tsx";
import ErrorBoundary from "./ErrorBoundary.tsx";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* ★ 影コントローラを全ページで有効化 */}
      <ChromeFX />
      <BrowserRouter>
        <Router />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
