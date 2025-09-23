import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 既ログインでも /signup から自動で /app に飛ばない（オンボーディングのため）
  useEffect(() => {
    // 何もしない（従来の getSession→/app は削除）
  }, []);

  const canSubmit =
    email && pw.length >= 8 && pw === pw2 && !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null); setOkMsg(null);
    if (pw !== pw2) { setMsg("確認用パスワードが一致しません。"); return; }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`, // ← 認証完了の戻り先（/auth を Redirect URLs に登録済みであること）
          // data: { 任意の user_metadata }
        },
      });
      if (error) throw error;

      // メール確認ONの場合は「確認メールを送信しました」と出す
      setOkMsg("確認メールを送信しました。メール内のリンクから続行してください。");
      // すぐに遷移させない。ユーザーはメールのリンクを踏んで /auth に戻ってくる。
    } catch (err: any) {
      const m = String(err?.message || "");
      if (m.includes("forbidden_domain")) {
        setMsg("許可されていないメールドメインです。会社のメールアドレスで入力してください。");
      } else {
        setMsg(`登録に失敗：${m || "不明なエラー"}`);
      }
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
        <form className="auth-card" onSubmit={onSubmit} aria-labelledby="signupTitle">
          <h2 id="signupTitle" className="auth-card-title">新規登録</h2>

          <label className="label" htmlFor="email">メールアドレス</label>
          <div className="input-group">
            <span className="input-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M4 6h16v12H4z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
            <input
              id="email"
              type="email"
              placeholder="you@company.co.jp"
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
              autoComplete="new-password"
            />
            <button
              type="button"
              className="input-affix-btn"
              aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
              onClick={() => setShowPw(v => !v)}
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

          <label className="label" htmlFor="pw2" style={{ marginTop: 10 }}>パスワード（確認）</label>
          <div className="input-group">
            <span className="input-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <rect x="5" y="10" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="1.6"/>
              </svg>
            </span>
            <input
              id="pw2"
              type={showPw ? "text" : "password"}
              placeholder="もう一度入力"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              disabled={busy}
              className="input"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {okMsg && <div className="auth-alert ok" role="status">{okMsg}</div>}
          {msg && <div className="auth-alert err" role="alert">{msg}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={!canSubmit}>
            {busy ? <span className="spinner" aria-hidden /> : <span>登録する</span>}
          </button>

          <button
            type="button"
            className="btn btn-secondary auth-alt"
            onClick={() => nav("/login")}
            disabled={busy}
          >
            ログインへ戻る
          </button>
        </form>
      </main>
    </>
  );
}
