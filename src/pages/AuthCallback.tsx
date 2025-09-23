// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * メールリンク（magiclink / signup / invite / email_change / recovery）の着地点。
 * URLハッシュ(#access_token&type=...)の取り込みを待ってから、適切なページに遷移する。
 * - type=recovery は /reset-password へ即遷移
 * - 上記以外は、セッションが確立したら /app へ
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const [msg, setMsg] = useState<string>("認証処理を実行しています…");

  useEffect(() => {
    let alive = true;

    const hash = window.location.hash || "";
    const q = new URLSearchParams(hash.replace(/^#/, ""));
    const type = q.get("type"); // recovery | magiclink | signup | invite | email_change ...

    // recovery はそのまま再設定画面へ
    if (type === "recovery") {
      nav("/reset-password", { replace: true });
      return;
    }

    const proceed = async () => {
      // まず即時にセッションを確認
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      // next=? があれば優先（なければ /app）
      const next = new URLSearchParams(window.location.search).get("next") || "/app";

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

    proceed();

    return () => { alive = false; };
  }, [nav, loc]);

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
