// src/pages/ForgotPassword.tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { isAllowedEmail } from "../utils/domain";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    if (!isAllowedEmail(email)) {
      setMsg("許可されていないメールドメインです。会社のメールアドレスで入力してください。");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) { setMsg(`送信に失敗：${error.message}`); return; }
      setOkMsg("再設定用のメールを送信しました。受信トレイをご確認ください。");
    } catch (e: any) {
      setMsg(`送信に失敗：${e?.message ?? "不明なエラー"}`);
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
        <form className="auth-card" onSubmit={onSubmit} aria-labelledby="fpTitle">
          <h2 id="fpTitle" className="auth-card-title">パスワード再設定</h2>

          <label className="label" htmlFor="email">登録メールアドレス</label>
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
              placeholder="you@your-company.co.jp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="input"
              required
              autoComplete="email"
              inputMode="email"
            />
          </div>

          {okMsg && <div className="auth-alert ok" role="status">{okMsg}</div>}
          {msg && <div className="auth-alert err" role="alert">{msg}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden /> : <span>再設定メールを送る</span>}
          </button>

          <Link to="/login" className="link-quiet" style={{ display: "inline-block", marginTop: 8 }}>
            ログインへ戻る
          </Link>
        </form>
      </main>
    </>
  );
}
