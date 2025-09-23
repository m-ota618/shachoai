// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * メールリンク（magiclink / signup / invite / email_change / recovery）の着地点。
 * - 初期レンダーで URLハッシュ(#...) を先取りしてから判定（Supabase が消す前に確保）
 * - type=recovery は /reset-password へ即遷移（セッション有無より優先）
 * - それ以外は、セッションが確立したら /app（または next）へ
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const [msg, setMsg] = useState("認証処理を実行しています…");

  // ★ ここが重要：初期レンダー時に“同期的”にハッシュを奪取
  const initial = useMemo(() => {
    const hash = typeof window !== "undefined" ? (window.location.hash || "") : "";
    const q = new URLSearchParams(hash.replace(/^#/, ""));
    return {
      hash,
      type: q.get("type"), // "recovery" | "magiclink" | "signup" | ...
    };
  }, []); // ← 初期化時の一度きり

  useEffect(() => {
    let alive = true;

    // 1) recovery は最優先で /reset-password に飛ばす
    if (initial.type === "recovery") {
      nav("/reset-password", { replace: true });
      return;
    }

    // 2) それ以外（magiclink / signup / invite / email_change など）
    const run = async () => {
      const next = new URLSearchParams(window.location.search).get("next") || "/app";

      // まず即時にセッション確認
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (data.session) {
        nav(next, { replace: true });
        return;
      }

      // 遅延に備え、onAuthStateChange を待機
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!alive) return;
        if (session) nav(next, { replace: true });
      });

      // タイムアウト保険
      const timeout = setTimeout(() => {
        if (!alive) return;
        setMsg("認証に時間がかかっています。メールのリンクをもう一度開くか、ページを再読み込みしてください。");
      }, 8000);

      return () => {
        clearTimeout(timeout);
        sub.subscription.unsubscribe();
      };
    };

    run();

    return () => { alive = false; };
  }, [initial.type, nav, loc]);

  return (
    <>
      <header className="app-header" role="banner">
        <img src="/planter-lockup.svg" alt="Planter" className="brand-lockup" />
        <div className="app-header-divider" />
      </header>
      <main className="auth-center">
        <div className="auth-card" aria-live="polite">
          <h2 className="auth-card-title">ログイン処理中</h2>
        <div className="skeleton">{msg}</div>
        </div>
      </main>
    </>
  );
}
