// src/pages/SetPassword.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function SetPassword() {
  const nav = useNavigate();
  const loc = useLocation();
  // ★ 追加：?from=
  const searchParams = new URLSearchParams(loc.search);
  const fromParam = searchParams.get("from");
  const safeFrom = fromParam && fromParam.startsWith("/") ? fromParam : null;

  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(!!data.session);
      setSessionReady(true);
    })();
  }, []);

  const submit = async () => {
    if (pw !== pw2) { setMsg("確認用パスワードが一致しません。"); return; }
    if (pw.length < 8) { setMsg("8文字以上で入力してください。"); return; }

    setBusy(true);
    setMsg(null);
    setOkMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setMsg(`設定に失敗：${error.message}`); return; }
      setOkMsg("パスワードを設定しました。");
      // ★ 修正：from があればそこへ、なければ /app
      if (safeFrom) {
        nav(safeFrom, { replace: true });
      } else {
        nav("/app", { replace: true });
      }
    } catch (e: any) {
      setMsg(`設定に失敗：${e?.message ?? "不明なエラー"}`);
    } finally {
      setBusy(false);
    }
  };

  if (!sessionReady) return <main className="auth">読み込み中…</main>;

  return (
    <main className="auth">
      <h1>パスワード設定</h1>
      {okMsg ? <div className="notice">{okMsg}</div> : null}
      {msg ? <div className="alert">{msg}</div> : null}

      <label className="label" htmlFor="pw">新しいパスワード</label>
      <div className="input-group">
        <input
          id="pw"
          type={showPw ? "text" : "password"}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="new-password"
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

      <label className="label" htmlFor="pw2">新しいパスワード（確認）</label>
      <input
        id="pw2"
        type={showPw ? "text" : "password"}
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
        autoComplete="new-password"
      />

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>設定して続行</button>
      </div>
    </main>
  );
}
