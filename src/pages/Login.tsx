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

  // ★ 追加：RequireAuth から渡された遷移先（?from=）を取得
  const searchParams = new URLSearchParams(loc.search);
  const fromParam = searchParams.get("from");
  const safeFrom = fromParam && fromParam.startsWith("/") ? fromParam : null;

  // ルーターガード（RequireAuth）からの理由付リダイレクトを拾う
  const reason = (loc.state as any)?.reason as string | undefined;
  useEffect(() => {
    if (reason === "forbidden_domain") {
      setMsg("許可されていないメールドメインです。");
    }
  }, [reason]);

  const login = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      if (!data.session) {
        setMsg("セッションを取得できませんでした。");
        return;
      }

      // ★ 修正：成功時の遷移。from があればそこへ、無ければ /app
      if (safeFrom) {
        nav(safeFrom, { replace: true });
      } else {
        nav("/app", { replace: true });
      }
    } catch (e: any) {
      setMsg(e?.message ?? "エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth">
      <h1>ログイン</h1>
      {msg && <div className="alert">{msg}</div>}
      <label className="label" htmlFor="email">メールアドレス</label>
      <input
        id="email" type="email" value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
      />
      <label className="label" htmlFor="pw">パスワード</label>
      <div className="input-group">
        <input
          id="pw"
          type={showPw ? "text" : "password"}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
        />
        <button
          type="button"
          className="input-affix-btn"
          aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
          onClick={() => setShowPw((v) => !v)}
          disabled={busy}
        >
          {showPw ? "🙈" : "👁️"}
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" onClick={login} disabled={busy}>
          ログイン
        </button>
        <Link to="/forgot-password" className="btn btn-link">パスワードをお忘れの方</Link>
      </div>
    </main>
  );
}
