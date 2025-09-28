// src/pages/Login.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // （必要なら）他画面からの理由付リダイレクト表示
  const reason = (loc.state as any)?.reason as string | undefined;
  useEffect(() => {
    if (reason === "forbidden_domain") {
      setMsg("許可されていないメールドメインです。会社のメールアドレスでログインしてください。");
    }
  }, [reason]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) { setMsg(`ログイン失敗：${error.message}`); return; }

      // ★追加：サインイン直後に必ず自動所属付与を試す（失敗しても続行）
      try {
        await supabase.rpc("ensure_membership_for_current_user");
      } catch {
        /* noop */
      }

      // ★ 管理者判定（@starbasket-ai.com）
      let isAdmin = false;
      try {
        const r = await supabase.rpc("get_is_admin");
        isAdmin = !!r.data;
      } catch {
        /* 非管理者で続行 */
      }
      if (isAdmin) {
        nav("/admin/tenants", { replace: true });
        return;
      }

      // ★ 所属テナント取得 → 件数で分岐
      const r1 = await supabase.rpc("get_accessible_orgs");
      const list = (r1.data as { slug: string }[]) || [];

      if (list.length === 1) {
        nav(`/${list[0].slug}/app`, { replace: true });
        return;
      }
      if (list.length > 1) {
        // 一般ユーザーでも選択画面として流用
        nav("/admin/tenants", { replace: true });
        return;
      }

      // ★ 未所属：サインイン状態は維持して /app に退避（ループ回避）
      setMsg("アクセスできるテナントが見つかりません。管理者にお問い合わせください。");
      nav("/app", { replace: true });
    } catch (e: any) {
      setMsg(`ログイン失敗：${e?.message ?? "不明なエラー"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* アプリ共通ヘッダ */}
      <header className="app-header" role="banner">
        <img src="/planter-lockup.svg" alt="Planter" className="brand-lockup" />
        <div className="app-header-divider" />
      </header>

      {/* 中央カード */}
      <main className="auth-center">
        <form className="auth-card" onSubmit={login} aria-labelledby="loginTitle">
          <h2 id="loginTitle" className="auth-card-title">ログイン</h2>

          <label className="label" htmlFor="email">メールアドレス</label>
          <div className="input-group">
            <span className="input-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" strokeWidth="1.6"/>
              </svg>
            </span>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="input"
              required
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <label className="label" htmlFor="pw" style={{ marginTop: 10 }}>パスワード</label>
          <div className="input-group">
            <span className="input-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <rect x="5" y="10" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="1.6"/>
              </svg>
            </span>
            <input
              id="pw"
              type={showPw ? "text" : "password"}
              placeholder="8文字以上"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={busy}
              className="input"
              required
              minLength={8}
              autoComplete="current-password"
              inputMode="text"
            />
            <button
              type="button"
              className="input-affix-btn"
              aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
              onClick={() => setShowPw((v) => !v)}
              disabled={busy}
            >
              {showPw ? (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7c-2.6 0-4.9-1.2-6.7-2.9" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                  <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              )}
            </button>
          </div>

          {msg && (
            <div role="alert" aria-live="polite" className="auth-alert err">
              {msg}
            </div>
          )}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden /> : <span>ログイン</span>}
          </button>

          {/* 別画面で再設定（submitを絶対に発火させない） */}
          <button
            type="button"
            className="btn btn-secondary auth-alt"
            title="再設定用リンクをメールで受け取る"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              nav("/forgot-password");
            }}
          >
            パスワードをお忘れの方
          </button>

          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 13 }}>
            アカウントをお持ちでない方は{" "}
            <Link to="/signup" className="auth-link">新規登録</Link>
          </div>
        </form>
      </main>
    </>
  );
}
