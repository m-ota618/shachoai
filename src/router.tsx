// src/router.tsx
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Signup from "./pages/Signup";
import App from "./App";

// フロント用 許可ドメイン（空ならフロント側ガードは無効＝サーバ側だけで制御）
const FRONT_ALLOWED = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedDomain(email: string): boolean {
  if (!FRONT_ALLOWED.length) return true; // 未設定なら通す（最終的にはAPI側が403で止める）
  const d = email.toLowerCase().split("@")[1] || "";
  return FRONT_ALLOWED.some((dom) => d === dom || d.endsWith("." + dom));
}

// 認証＋ドメインガード
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    let mounted = true;

    async function init() {
      // 1) セッション有無
      const { data } = await supabase.auth.getSession();
      const has = !!data.session;
      if (!mounted) return;
      setSignedIn(has);

      // 2) ドメイン判定（サインイン済みのときだけ）
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

    // 状態変化も追う
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
    // サインアウトは非同期だが、即座に遷移させる
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

  // ドメイン不一致は /login へ（理由付き）
  if (forbidden) return <Navigate to="/login" replace state={{ reason: "forbidden_domain" }} />;

  return <>{children}</>;
}

export default function Router() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
