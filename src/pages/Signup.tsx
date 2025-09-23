// src/pages/Signup.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAllowedEmail } from "../utils/domain";

/**
 * 会社メールでの登録/ログイン（自己登録）
 * - 本番: Supabase Edge Function を絶対URLで呼ぶ（CORS前提）
 * - 開発: Vite dev のプロキシ（/functions/v1/*）を使うことも可能
 *
 * NOTE:
 * - 許可ドメインの最終判定はバックエンド（self-enroll）側。フロントの isAllowedEmail はUX向上用。
 * - テスト目的で `gmail.com` を DB に入れてもOK。テスト完了後は org_domains から削除すれば本番に影響なし。
 */
export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Functions の呼び先を環境に応じて決定
  // 優先度: VITE_FUNCTIONS_BASE > (dev かつ VITE_USE_PROXY=true) > VITE_SUPABASE_URL の /functions/v1
  const fnUrl = useMemo(() => {
    const baseFromEnv = String(import.meta.env.VITE_FUNCTIONS_BASE || "").trim(); // 例: https://xxxx.functions.supabase.co
    if (baseFromEnv) return `${baseFromEnv.replace(/\/$/, "")}/self-enroll`;

    const useProxy = String(import.meta.env.VITE_USE_PROXY || "").toLowerCase() === "true";
    if (import.meta.env.DEV && useProxy) {
      // vite.config.ts 側で /functions/v1 → Supabase Functions にプロキシしている前提
      return "/functions/v1/self-enroll";
    }

    const supaBase = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    if (supaBase) return `${supaBase}/functions/v1/self-enroll`;

    // 最後の保険（同一オリジンに関数がある構成向け。通常は使わない想定）
    return `${window.location.origin}/functions/v1/self-enroll`;
  }, []);

  // 既ログインでも /signup からは自動遷移しない（オンボーディング導線維持）
  // 以前の getSession→/app は削除

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    // UX向けの簡易チェック（本番の最終ブロックは Edge Function）
    if (!isAllowedEmail(email)) {
      setMsg("許可されていないメールドメインです。会社のメールアドレスで入力してください。");
      return;
    }

    setBusy(true);
    try {
      // CORS安定化のため、余計なヘッダは送らない（apikeyは付けない）
      const headers: Record<string, string> = { "content-type": "application/json" };

      // ネットワークが詰まってもUIが返ってくるように AbortController でタイムアウトを付与
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 15000); // 15s タイムアウト

      const res = await fetch(fnUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ email }),
        credentials: "omit",
        signal: ac.signal,
        mode: "cors",
      }).finally(() => clearTimeout(t));

      // CORS失敗などでレスポンスが取れないときに備えて一旦安全にparse
      const text = await res.text();
      let body: any = {};
      try { body = text ? JSON.parse(text) : {}; } catch {}

      if (!res.ok) {
        if (body?.error === "forbidden_domain") {
          setMsg("許可されていないメールドメインです。会社のメールアドレスで入力してください。");
        } else if (body?.error === "invalid_email") {
          setMsg("メールアドレスの形式が正しくありません。");
        } else if (res.status === 429) {
          setMsg("送信が集中しています。しばらくしてからお試しください。");
        } else if (res.status === 401 || res.status === 403) {
          setMsg("送信に失敗しました。アクセスが許可されていません。（管理者にお問い合わせください）");
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
    } catch (err: any) {
      // fetch自体が投げた場合（CORS/ネットワーク/タイムアウト）
      if (err?.name === "AbortError") {
        setMsg("送信に時間がかかっています。ネットワーク環境を確認して再度お試しください。");
      } else {
        setMsg(`送信に失敗：${err?.message ?? "ネットワークエラー"}`);
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
