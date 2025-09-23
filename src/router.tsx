// src/router.tsx の中などにある RequireAuth を丸ごと差し替え
import React, { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";

// フロント側の“保険”ドメインリスト（空なら無効）
const FRONT_ALLOWED = String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function isAllowedDomain(email: string): boolean {
  if (!FRONT_ALLOWED.length) return true; // ← 空ならガード無効（Hookが真のガード）
  const d = (email.toLowerCase().split("@")[1] || "").trim();
  return FRONT_ALLOWED.some((dom) => d === dom || d.endsWith("." + dom));
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation();

  // 画面表示に使う3状態
  const [ready, setReady] = useState(false);       // 「もう判定できる」か
  const [signedIn, setSignedIn] = useState(false); // セッションの有無
  const [forbidden, setForbidden] = useState(false); // フロントのドメイン保険

  // 競合を防ぐために“生存フラグ”とタイムアウトIDを保持
  const aliveRef = useRef(true);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    aliveRef.current = true;

    // ① 初回の同期：getSession() が返ったら **必ず** ready を true にする
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!aliveRef.current) return;

        const has = !!data.session;
        setSignedIn(has);

        if (has) {
          // email が取れない一瞬に備えて getUser() を明示呼び出し
          const { data: u } = await supabase.auth.getUser();
          if (!aliveRef.current) return;
          const email = u.user?.email || "";
          setForbidden(!isAllowedDomain(email));
        } else {
          setForbidden(false);
        }
      } catch {
        // 取得失敗でもユーザーをブロックしない（画面が固まらないことを優先）
      } finally {
        // ★ 初回の成否にかかわらず ready を **必ず** true にするのがキモ
        if (aliveRef.current) setReady(true);
      }
    })();

    // ② 後続の変化監視：ログイン/ログアウト/トークン更新など
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
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

    // ③ フェイルセーフ：何らかの理由で ready が立たない場合の脱出路
    //    ここでは“強制で ready を立てる”だけにするのが安全（/login 強制遷移はしない）
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

  // ④ フロントの保険で forbidden になったら「即サインアウト→/login」
  //    （Hook で弾けていれば通常ここには来ない。二重安全網）
  useEffect(() => {
    if (!ready || !forbidden) return;
    // signOut() の結果は待たず、即座にログインへ
    supabase.auth.signOut().catch(() => {});
  }, [ready, forbidden]);

  // ⑤ UI 分岐（“固まらない”ことを最優先）
  if (!ready) {
    // 初回ローディング（最大 6 秒想定）
    return (
      <main className="content">
        <div className="wrap"><div className="skeleton">認証状態を確認中...</div></div>
      </main>
    );
  }

  if (!signedIn) {
    // 未ログイン：元の場所を記録して /login へ
    // 例: /login?from=/app
    const from = encodeURIComponent(loc.pathname + loc.search);
    return <Navigate to={`/login?from=${from}`} replace />;
  }

  if (forbidden) {
    // 許可外ドメイン（保険）：ドメイン理由を渡してログイン画面へ
    return <Navigate to="/login" replace state={{ reason: "forbidden_domain" }} />;
  }

  // OK：保護エリア表示
  return <>{children}</>;
}
