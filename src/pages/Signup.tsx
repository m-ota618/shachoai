// src/pages/Signup.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 既ログインでも /signup から自動遷移しない（オンボーディングのため）
  useEffect(() => {
    // 何もしない
  }, []);

  const canSubmit = !!email && !!pw && !!pw2 && !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    const mail = email.trim().toLowerCase();
    if (!mail.includes("@")) {
      setMsg("メールアドレスの形式が正しくありません。");
      return;
    }
    if (pw.length < 8) {
      setMsg("パスワードは8文字以上で入力してください。");
      return;
    }
    if (pw !== pw2) {
      setMsg("パスワードが一致しません。");
      return;
    }

    setBusy(true);
    try {
      // ★ Supabase JS v2: signUp は引数1つ（options 内に emailRedirectTo）
      const { error } = await supabase.auth.signUp({
        email: mail,
        password: pw,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?flow=signup`,
        },
      });

      if (error) {
        const status = (error as any).status;
        if (status === 422) {
          setMsg("このメールはすでに登録済みです。ログインするか、パスワード再設定をご利用ください。");
        } else if (/redirect/i.test(error.message || "")) {
          setMsg("リダイレクトURLが許可されていません。管理者にお問い合わせください。");
        } else {
          setMsg(`登録に失敗しました：${error.message}`);
        }
        return;
      }

      // 新規作成 or 未確認ユーザーへの再送のどちらでもこの文言でOK
      setOkMsg("確認メールを送信しました。メール内のリンクから登録を完了してください。");
    } catch (e: any) {
      setMsg(`通信エラーが発生しました：${e?.message ?? "不明なエラー"}`);
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
              type="password"
              placeholder="8文字以上"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={busy}
              className="input"
              required
              minLength={8}
              autoComplete="new-password"
              inputMode="text"
            />
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
              type="password"
              placeholder="もう一度入力"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              disabled={busy}
              className="input"
              required
              minLength={8}
              autoComplete="new-password"
              inputMode="text"
            />
          </div>

          {okMsg && <div className="auth-alert ok" role="status">{okMsg}</div>}
          {msg && <div className="auth-alert err" role="alert">{msg}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={!canSubmit}>
            {busy ? <span className="spinner" aria-hidden /> : <span>確認メールを送る</span>}
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
