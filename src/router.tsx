import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import SetPassword from "./pages/SetPassword";
import App from "./App";
import AdminTenants from "./pages/AdminTenants";

/* フロント側の許可ドメイン判定は廃止（DB/RPCで判定するため不要） */

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();

  const aliveRef = useRef(true);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    aliveRef.current = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!aliveRef.current) return;
        setSignedIn(!!data.session);
      } finally {
        if (aliveRef.current) setReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!aliveRef.current) return;
      setSignedIn(!!session);
    });

    // ローディング保険
    timeoutRef.current = window.setTimeout(() => {
      if (!aliveRef.current) return;
      setReady((prev) => prev || true);
    }, 6000) as unknown as number;

    return () => {
      aliveRef.current = false;
      sub.subscription.unsubscribe();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  /* ★ 自動誘導：/admin 配下はスキップ。非管理者は所属解決を試みる */
  useEffect(() => {
    if (!ready || !signedIn) return;

    const pathname = loc.pathname || "/";

    // /admin は自動リダイレクト禁止（URLと画面がズレないように）
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;

    const seg = pathname.split("/").filter(Boolean);
    const first = seg[0] || "";
    const protectedWords = new Set(["admin", "login", "signup", "auth", "set-password"]);
    const hasSlug = seg.length >= 2 && !protectedWords.has(first);
    // 例: /app -> ["app"] => hasSlug=false
    //     /okura/app -> ["okura","app"] => hasSlug=true

    (async () => {
      if (hasSlug) return; // すでに /:slug/... にいるなら誘導不要

      // ★ 1) 管理者かどうか
      let isAdmin = false;
      try {
        const r = await supabase.rpc("get_is_admin");
        isAdmin = !!r.data;
      } catch {/* 非管理者として続行 */}
      if (isAdmin) {
        navigate("/admin/tenants", { replace: true });
        return;
      }

      // ★ 2) 所属テナント（既存チェック）
      const { data, error } = await supabase.rpc("get_accessible_orgs");
      if (!error) {
        const list = (data as { slug: string }[]) || [];
        if (list.length === 1) {
          navigate(`/${list[0].slug}/app`, { replace: true });
          return;
        }
        if (list.length > 1) {
          navigate("/admin/tenants", { replace: true });
          return;
        }
      }

      // ★変更: 3) 未所属 → まず作る（ensure_membership_for_current_user）
      try {
        const r2 = await supabase.rpc("ensure_membership_for_current_user");
        const ensured = (r2.data as { slug: string }[]) || [];
        if (ensured.length > 0 && ensured[0]?.slug) {
          navigate(`/${ensured[0].slug}/app`, { replace: true });
          return;
        }
      } catch {/* noop */}

      // ★変更: 4) どうしても解決できない場合 → /login に戻さず /app に留める（署名は維持）
      // （/app では UI 上で「アクセス権がありません」などの案内を出す想定）
      navigate("/app", { replace: true });
    })();
  }, [ready, signedIn, loc.pathname, navigate]);

  // 初回ロード中はローディング
  if (!ready) {
    return (
      <main className="content">
        <div className="wrap">
          <div className="skeleton">認証状態を確認中...</div>
        </div>
      </main>
    );
  }

  if (!signedIn) {
    const from = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  return <>{children}</>;
}

export default function Router() {
  return (
    <Routes>
      {/* 直叩きトップはログインへ */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* 公開ルート */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* 管理UI（テナント選択）— /admin は自動誘導の対象外 */}
      <Route
        path="/admin/tenants"
        element={
          <RequireAuth>
            <AdminTenants />
          </RequireAuth>
        }
      />

      {/* 保護ルート（slugなし） */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />

      {/* DB版（slug付き） */}
      <Route
        path="/:slug/app"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />

      {/* ワイルドカードは雑リダイレクトしない（/admin を誤吸収させない） */}
      <Route path="*" element={<div>404</div>} />
    </Routes>
  );
}
