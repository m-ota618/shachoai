// src/router.tsx
import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom"; // ← useNavigate を追加
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

// 認証＋ドメインガード（/app など保護ルート専用）
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate(); // ← 追加

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

    // フォールバック保険（ロードが長引いてもUIを動かす）
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

  // 許可ドメイン外はサインアウトしてログインへ
  useEffect(() => {
    if (!ready || !forbidden) return;
    supabase.auth.signOut().catch(() => {});
  }, [ready, forbidden]);

  /* ★ 自動誘導：/admin 配下は完全スキップ（ここが肝） */
  useEffect(() => {
    if (!ready || !signedIn) return;

    const pathname = loc.pathname || "/";

    // /admin 直下 or /admin/... は自動リダイレクト一切禁止
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;

    const seg = pathname.split("/").filter(Boolean);
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
        navigate("/admin/tenants", { replace: true }); // ← 変更
      } else if (list.length === 1) {
        // 一般：自社slugへ
        navigate(`/${list[0].slug}/app`, { replace: true }); // ← 変更
      } else {
        // 未所属：ログインへ（必要に応じて案内ページに変更可）
        navigate("/login", { replace: true }); // ← 変更
      }
    })();
  }, [ready, signedIn, loc.pathname, navigate]); // ← navigate を依存に追加

  // 初回ロード中はローディング（ログイン画面へ即リダイレクトはしない）
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

  if (forbidden) {
    return <Navigate to="/login" replace state={{ reason: "forbidden_domain" }} />;
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

      {/* ★ ワイルドカードは雑リダイレクトしない（/admin を誤吸収させない） */}
      <Route path="*" element={<div>404</div>} />
    </Routes>
  );
}
