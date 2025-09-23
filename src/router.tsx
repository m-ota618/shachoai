// src/router.tsx
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import SetPassword from "./pages/SetPassword"; // ★ 追加
import App from "./App";

// フロント用 許可ドメイン（空ならフロント側ガードは無効＝サーバ側だけで制御）
const FRONT_ALLOWED = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedDomain(email: string): boolean {
  if (!FRONT_ALLOWED.length) return true;
  const d = email.toLowerCase().split("@")[1] || "";
  return FRONT_ALLOWED.some((dom) => d === dom || d.endsWith("." + dom));
}

// 認証＋ドメインガード（/app など保護ルート専用）
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      const has = !!data.session;
      if (!mounted) return;
      setSignedIn(has);

      if (has) {
        const { data: u } = await supabase.auth.getUser();
        const email = u.user?.email || "";
        const ok = email ? isAllowedDomain(email) : false;
        setForbidden(!ok);
      } else {
        setForbidden(false);
      }
      setReady(true);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!mounted) return;
      const has = !!session;
      setSignedIn(has);
      if (has) {
        const { data: u } = await supabase.auth.getUser();
        const email = u.user?.email || "";
        setForbidden(!isAllowedDomain(email));
      } else {
        setForbidden(false);
      }
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 禁止ユーザーはサインアウトして /login へ
  useEffect(() => {
    if (!ready || !forbidden) return;
    supabase.auth.signOut().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, forbidden]);

  if (!ready) {
    return (
      <main className="content">
        <div className="wrap"><div className="skeleton">認証状態を確認中...</div></div>
      </main>
    );
  }
  if (!signedIn) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (forbidden) return <Navigate to="/login" replace state={{ reason: "forbidden_domain" }} />;

  return <>{children}</>;
}

export default function Router() {
  return (
    <Routes>
      {/* 公開ルート */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      {/* メールリンクの着地（ハッシュ #type=... を拾って内部で分岐 → /set-password 等へ） */}
      <Route path="/auth" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* ★ 招待/サインアップ完了後の初回パスワード設定 */}
      <Route path="/set-password" element={<SetPassword />} />

      {/* 保護ルート */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />

      {/* デフォルト */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
