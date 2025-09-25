import React, { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import SetPassword from "./pages/SetPassword";
import App from "./App";

// フロント用 許可ドメイン（空なら無効＝サーバ側だけで制御）
const FRONT_ALLOWED = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedDomain(email: string): boolean {
  if (!FRONT_ALLOWED.length) return true;
  const d = (email.toLowerCase().split("@")[1] || "").trim();
  return FRONT_ALLOWED.some((dom) => d === dom || d.endsWith("." + dom));
}

function useSlug() {
  const { slug } = useParams();
  return (slug || "").toLowerCase();
}

// 認証＋ドメインガード（保護ルート専用）
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const loc = useLocation();
  const slug = useSlug();

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

  // slug 未指定はログインへ（/app 直打ち防止）
  if (!slug && loc.pathname.startsWith("/app")) {
    return <Navigate to="/login" replace />;
  }

  // 初回ロード中
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
      {/* 既定はログインへ */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />

      {/* 公開ルート */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/auth" element={<AuthCallback />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* 保護ルート：/:slug/app に統一 */}
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
