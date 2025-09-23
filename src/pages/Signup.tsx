// src/pages/Signup.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAllowedEmail } from "../utils/domain";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 開発/本番で Functions の呼び先を出し分け
  const fnUrl = useMemo(() => {
    const useProxy = String(import.meta.env.VITE_USE_PROXY || "").toLowerCase() === "true";
    const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (import.meta.env.DEV && useProxy) return "/functions/v1/self-enroll";
    if (base) return `${base}/functions/v1/self-enroll`;
    return `${window.location.origin}/functions/v1/self-enroll`;
  }, []);

  // ★ 重要：既ログインでも /signup から自動遷移しない（オンボーディング導線のため）
  // （従来の getSession→/app は削除）

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    // フロント側の簡易ドメインチェック（最終的なブロックは Edge Function 側で実施）
    if (!isAllowedEmail(email)) {
      setMsg("許可されていないメールドメインです。会社のメールアドレスで入力してください。");
      return;
    }

    setBusy(true);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const isDirect = fnUrl.startsWith("http");
      if (isDirect && import.meta.env.VITE_SUPABASE_ANON_KEY) {
        headers["apikey"] = String(import.meta.env.VITE_SUPABASE_ANON_KEY);
      }

      const res = await fetch(fnUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ email }),
      });

      const body: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (body?.error === "forbidden_domain") {
          setMsg("許可されていないメールドメインです。会社のメールアドレスで入力してください。");
        } else if (body?.error === "invalid_email") {
          setMsg("メールアドレスの形式が正しくありません。");
        } else if (res.status === 429) {
          setMsg("送信が集中しています。しばらくしてからお試しください。");
        } else {
          setMsg(`送信に失敗しました。時間をおいて再度お試しください。${body?.detail ? `（${body.detail}）` : ""}`);
        }
        return;
      }

      if (body?.already_exists) {
        setOkMsg("このメールは登録済みです。ログイン画面からログインしてください。");
      } else {
        setOkMsg("ログイン用のメールを送信しました。受信トレイをご確認ください。");
      }
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
        <form className="auth-card" onSubmit={onSubmit} aria-labelledby="signupTitle">
          <h2 id="signupTitle" className="auth-card-title">会社メールで登録・ログイン</h2>

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

          <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden /> : <span>ログインリンクを送る</span>}
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
