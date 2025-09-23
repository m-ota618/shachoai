// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * メールリンク（magiclink / signup / invite / email_change / recovery）の着地点。
 * - 初回レンダーで URL ハッシュ(#...) を確保（Supabase が消す前に読む）
 * - type=recovery は最優先で /reset-password へ
 * - type=signup | magiclink は /set-password へ
 * - 上記以外（invite / email_change など）はセッション確立後に /app（または ?next=）へ
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const [msg, setMsg] = useState("認証処理を実行しています…");

  // 初期レンダー時にハッシュを奪取（同期的に）
  const initial = useMemo(() => {
    const hash = typeof window !== "undefined" ? (window.location.hash || "") : "";
    const q = new URLSearchParams(hash.replace(/^#/, ""));
    return {
      hash,
      type: q.get("type"), // "recovery" | "magiclink" | "signup" | "invite" | "email_change" | ...
    };
  }, []);

  useEffect(() => {
    let alive = true;

    // 1) recovery は無条件で /reset-password へ（セッション有無より優先）
    if (initial.type === "recovery") {
      nav("/reset-password", { replace: true });
      return;
    }

    // 2) signup / magiclink は初回パスワード設定へ、それ以外は /app（?next= 優先）
    const wantsSetPassword = initial.type === "signup" || initial.type === "magiclink";
    const run = async () => {
      const search = new URLSearchParams(window.location.search);
      const next = search.get("next") || "/app";
      const dest = wantsSetPassword ? "/set-password" : next;

      // 即時セッション確認
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (data.session) {
        nav(dest, { replace: true });
        return;
      }

      // 遅延に備えて onAuthStateChange を待機
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!alive) return;
        if (session) nav(dest, { replace: true });
      });

      // タイムアウト保険（UI 文言のみ）
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

