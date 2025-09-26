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

/* ★ 追加済み */
import AdminTenants from "./pages/AdminTenants";

// フロント用 許可ドメイン（空ならフロント側ガードは無効＝サーバ側だけで制御）
const FRONT_ALLOWED = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedDomain(email: string): boolean {
  if (!FRONT_ALLOWED.length) return true;
  const d = (email.toLowerCase().split("@")[1] || "").trim();
  return FRONT_ALLOWED.some((dom) => d === dom || d.endsWith("." + dom));
}

// 認証＋ドメインガード（/app など保護ルート専用）— 即リダイレクト版
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

  useEffect(() => {
    if (!ready || !forbidden) return;
    supabase.auth.signOut().catch(() => {});
  }, [ready, forbidden]);

  /* ★ 追加：slugなしで来た場合の自動誘導（管理者→/admin/tenants、一般→/:slug/app） */
  useEffect(() => {
    if (!ready || !signedIn) return;

    const seg = (location.pathname || "/").split("/").filter(Boolean);
    const first = seg[0] || "";
    const protectedWords = new Set(["admin", "login", "signup", "auth", "set-password"]);
    const hasSlug = seg.length >= 2 && !protectedWords.has(first);
    // 例: /app -> ["app"] => hasSlug=false
    //     /okura/app -> ["okura","app"] => hasSlug=true
    //     /admin/tenants -> ["admin","tenants"] => hasSlug=false（管理UIは別扱い）

    (async () => {
      if (hasSlug) return; // すでに /:slug/... にいる

      const { data, error } = await supabase.rpc("get_accessible_orgs");
      if (error) return; // 失敗時は既存挙動維持

      const list = (data as { slug: string }[]) || [];

      if (list.length > 1) {
        // 管理者：テナント選択画面へ
        window.history.replaceState(null, "", "/admin/tenants");
      } else if (list.length === 1) {
        // 一般：自社slugへ
        window.history.replaceState(null, "", `/${list[0].slug}/app`);
      } else {
        // 未所属：ログインへ（必要に応じて案内ページに変更可）
        window.history.replaceState(null, "", "/login");
      }
    })();
  }, [ready, signedIn]);

  // 初回ロード中はローディング（ログイン画面へ即リダイレクトはしない）
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
      {/* 直叩き・未知パスはログインへ */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />

      {/* 公開ルート */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* 保護ルート（既存） */}
      <Route
        path="/app"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />

      {/* 管理UI（テナント選択） */}
      <Route
        path="/admin/tenants"
        element={
          <RequireAuth>
            <AdminTenants />
          </RequireAuth>
        }
      />

      {/* DB版（slug付き）— 既存ロジックは変更せず同じ保護コンポーネント＆Appを再利用 */}
      <Route
        path="/:slug/app"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
