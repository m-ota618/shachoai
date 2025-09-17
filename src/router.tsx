// src/router.tsx
import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword"; // ★追加
import App from "./App";
import Signup from "./pages/Signup";

// 認証ガード
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    let mounted = true;

    // 初期セッション取得
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSignedIn(!!data.session);
      setReady(true);
    });

    // 状態変化を監視
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setSignedIn(!!session);
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <main className="content">
        <div className="wrap"><div className="skeleton">認証状態を確認中...</div></div>
      </main>
    );
  }
  if (!signedIn) return <Navigate to="/login" replace state={{ from: loc }} />;
  return <>{children}</>;
}

export default function Router() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      {/* ★メールリンクの着地点（未ログインでも入れる） */}
      <Route path="/reset-password" element={<ResetPassword />} />
      {/* 保護されたアプリ本体 */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />
      {/* 何でも /app へ（未ログインなら自動で /login） */}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
