import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function Signup() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 既ログインなら /app へ
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) nav("/app", { replace: true });
    });
  }, [nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);
    setBusy(true);
    try {
      // パスワード不要のメールマジックリンク
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/app`, // クリック後は /app へ
        },
      });
      if (error) {
        setMsg(`送信に失敗：${error.message}`);
        return;
      }
      setOkMsg("ログイン用のリンクを送信しました。メールをご確認ください。");
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
          <h2 id="signupTitle" className="auth-card-title">新規登録 / 招待なしログイン</h2>

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
              placeholder="you@okuratokyo.jp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className="input"
              required
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
