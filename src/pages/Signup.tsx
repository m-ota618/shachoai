// src/pages/Signup.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

// 環境変数から許可ドメイン一覧を取得（空ならフロント側チェックは無効）
function getAllowedDomains(): string[] {
  return String(import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
function isAllowedEmail(email: string, allowed: string[]): boolean {
  if (!allowed.length) return true;
  const d = (email.toLowerCase().split("@")[1] || "").trim();
  return !!d && allowed.some((dom) => d === dom || d.endsWith("." + dom));
}

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const allowedDomains = useMemo(() => getAllowedDomains(), []);

  useEffect(() => {
    // 既ログインでも /signup から自動遷移しない（オンボーディングのため）
  }, []);

  const mail = email.trim().toLowerCase();
  const domainOk = !email || isAllowedEmail(mail, allowedDomains);

  const canSubmit =
    !!email &&
    !!pw &&
    !!pw2 &&
    pw.length >= 8 &&
    pw === pw2 &&
    domainOk &&
    !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    if (!mail.includes("@")) {
      setMsg("メールアドレスの形式が正しくありません。");
      return;
    }
    if (!isAllowedEmail(mail, allowedDomains)) {
      setMsg("このメールドメインでは新規登録できません。会社のメールアドレスをご利用ください。");
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
      const { error } = await supabase.auth.signUp({
        email: mail,
        password: pw,
        options: { emailRedirectTo: `${window.location.origin}/auth?flow=signup` },
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

      setOkMsg("確認メールを送信しました。メールのリンクから登録を完了してください。");
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

          {!!email && !domainOk && (
            <div className="auth-alert err" role="alert" style={{ marginTop: 8 }}>
              入力されたドメインのメールでは登録できません。<br />
              会社のメールアドレスをご利用いただくか、管理者にご相談ください。
            </div>
          )}

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
              inputMode="text"
            />
            <button
              type="button"
              className="input-affix-btn"
              aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
              onClick={() => setShowPw((v) => !v)}
              disabled={busy}
              title={showPw ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPw ? "🙈" : "👁️"}
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
              type={showPw2 ? "text" : "password"}
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
            <button
              type="button"
              className="input-affix-btn"
              aria-label={showPw2 ? "パスワードを隠す" : "パスワードを表示"}
              onClick={() => setShowPw2((v) => !v)}
              disabled={busy}
              title={showPw2 ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPw2 ? "🙈" : "👁️"}
            </button>
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
