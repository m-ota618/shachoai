// src/pages/Login.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav("/app", { replace: true });
    });
  }, [nav]);
  // コールバックの種別ごとに遷移
  useEffect(() => {
    const hash = window.location.hash || "";
    const q = new URLSearchParams(hash.replace(/^#/, ""));
    const type = q.get("type");
    if (type === "recovery") {
      nav("/reset-password", { replace: true });
      return;
    }
    // signup / magiclink / email_change は /app へ
    if (type === "signup" || type === "magiclink" || type === "email_change" || type === "invite") {
      nav("/app", { replace: true });
      return;
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") nav("/reset-password", { replace: true });
      if (event === "SIGNED_IN") nav("/app", { replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) { setMsg(`ログイン失敗：${error.message}`); return; }
      const from = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/app";
      nav(from, { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMsg(`ログイン失敗：${message ?? "不明なエラー"}`);
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    setMsg(null);
    if (!email) { setMsg("メールアドレスを入力してください"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) { setMsg(`再設定メールの送信に失敗：${error.message}`); return; }
      setMsg("再設定メールを送信しました。");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMsg(`送信失敗：${message ?? "不明なエラー"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="app-header" role="banner">
        <img src="/planter-lockup.svg" alt="Planter" className="brand-lockup" />
        <div className="app-header-divider" />
      </header>

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

          <button
            type="button"
            className="btn btn-secondary auth-alt"
            onClick={sendReset}
            disabled={busy}
            title="入力したメールアドレス宛に再設定用リンクを送信します"
          >
            パスワードをお忘れの方
          </button>

          <div style={{ marginTop: 8, textAlign: 'center', fontSize: 13 }}>
            アカウントをお持ちでない方は{" "}
            <a href="/signup" onClick={(e)=>{ e.preventDefault(); nav('/signup'); }}>
              新規登録
            </a>
          </div>
        </form>
      </main>
    </>
  );
}
