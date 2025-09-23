// src/pages/Signup.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 自動遷移しない
  }, []);

  const canSubmit = !!email && !busy;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    const mail = email.trim().toLowerCase();
    if (!mail.includes("@")) {
      setMsg("メールアドレスの形式が正しくありません。");
      return;
    }

    setBusy(true);
    try {
      // 1) 許可ドメインチェックのみ
      const { error: checkErr } = await supabase.functions.invoke("self-enroll", {
        body: { email: mail, checkOnly: true },
      });
      if (checkErr) {
        if (checkErr.status === 403) {
          setMsg("このドメインのメールアドレスは登録できません。会社のメールアドレスで入力してください。");
        } else {
          setMsg("処理に失敗しました。時間をおいて再度お試しください。");
        }
        return;
      }

      // 2) OTPマジックリンクを送信
      const { error } = await supabase.auth.signInWithOtp({
        email: mail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth#type=signup`,
        },
      });
      if (error) {
        if (/Email provider is disabled/i.test(error.message)) {
          setMsg("メール送信が無効になっています。管理者にお問い合わせください。");
        } else {
          setMsg("処理に失敗しました。時間をおいて再度お試しください。");
        }
        return;
      }

      // 3) 成功メッセージは常に同じ
      setOkMsg("入力されたメールアドレス宛に案内メールを送信しました。届かない場合は迷惑メールをご確認ください。");
    } catch {
      setMsg("通信エラーが発生しました。時間をおいて再度お試しください。");
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

          {okMsg && <div className="auth-alert ok" role="status">{okMsg}</div>}
          {msg && <div className="auth-alert err" role="alert">{msg}</div>}

          <button type="submit" className="btn btn-primary auth-submit" disabled={!canSubmit}>
            {busy ? <span className="spinner" aria-hidden /> : <span>メールを送信</span>}
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
