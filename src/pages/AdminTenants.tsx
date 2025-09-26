// src/router.tsx
import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import SetPassword from "./pages/SetPassword";
import App from "./App";
import AdminTenants from "./pages/AdminTenants";

// フロント用 許可ドメイン（空ならフロント側ガードは無効）
const FRONT_ALLOWED = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedDomain(email: string): boolean {
  if (!FRONT_ALLOWED.length) return true;
  const d = (email.toLowerCase().split("@")[1] || "").trim();
  return FRONT_ALLOWED.some((dom) => d === dom || d.endsWith("." + dom));
}

// 認証＋ドメインガード
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const loc = useLocation();

  const aliveRef = useRef(true);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    aliveRef.current = true;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!aliveRef.current) return;

        const has = !!data.session;
        setSignedIn(has);

        if (has) {
          const { data: u } = await supabase.auth.getUser();
          if (!aliveRef.current) return;
          const email = u.user?.email || "";
          setForbidden(!isAllowedDomain(email));
        } else {
          setForbidden(false);
        }
      } finally {
        if (aliveRef.current) setReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!aliveRef.current) return;

      const has = !!session;
      setSignedIn(has);

      if (has) {
        const { data: u } = await supabase.auth.getUser();
        if (!aliveRef.current) return;
        const email = u.user?.email || "";
        setForbidden(!isAllowedDomain(email));
      } else {
        setForbidden(false);
      }
    });

    // 保険：長時間でもUIを進める
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

  // 許可ドメイン外はサインアウト
  useEffect(() => {
    if (!ready || !forbidden) return;
    supabase.auth.signOut().catch(() => {});
  }, [ready, forbidden]);

  // 自動誘導：/admin は完全スキップ（ここが肝）
  useEffect(() => {
    if (!ready || !signedIn) return;

    const pathname = loc.pathname || "/";
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;

    const seg = pathname.split("/").filter(Boolean);
    const first = seg[0] || "";
    const protectedWords = new Set(["admin", "login", "signup", "auth", "set-password"]);
    const hasSlug = seg.length >= 2 && !protectedWords.has(first);

    (async () => {
      if (hasSlug) return;

      const { data, error } = await supabase.rpc("get_accessible_orgs");
      if (error) return;

      const list = (data as { slug: string }[]) || [];

      if (list.length > 1) {
        window.history.replaceState(null, "", "/admin/tenants");
      } else if (list.length === 1) {
        window.history.replaceState(null, "", `/${list[0].slug}/app`);
      } else {
        window.history.replaceState(null, "", "/login");
      }
    })();
  }, [ready, signedIn, loc.pathname]);

  // ローディング
  if (!ready) {
    return (
      <main className="content">
        <div className="wrap"><div className="skeleton">認証状態を確認中...</div></div>
      </main>
    );
  }

  if (!signedIn) {
    const from = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  if (forbidden) {
    return <Navigate to="/login" replace state={{ reason: "forbidden_domain" }} />;
  }

  return <>{children}</>;
}

export default function Router() {
  return (
    <Routes>
      {/* トップはログインへ */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* 公開ルート */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* 管理UI（テナント選択）— /admin は自動誘導対象外 */}
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

      {/* ワイルドカードは雑リダイレクト禁止（誤吸収防止） */}
      <Route path="*" element={<div>404</div>} />
    </Routes>
  );
}
