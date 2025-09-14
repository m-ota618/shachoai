// src/pages/ResetPassword.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setReady(true);
      if (!data.session) {
        setErr("リンクの有効期限が切れているか、無効です。もう一度メールからやり直してください。");
      }
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr("パスワードは8文字以上にしてください。"); return; }
    if (pw !== pw2) { setErr("パスワードが一致しません。"); return; }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    alert("パスワードを更新しました。");
    nav("/app", { replace: true });
  };

  if (!ready) return null;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7fb", padding: 16 }}>
      <form onSubmit={submit}
        style={{ width: 420, maxWidth: "92vw", background: "#fff", border: "1px solid #e7edf4", borderRadius: 12, boxShadow: "0 8px 24px rgba(16,24,40,.08)", padding: 20 }}>
        <h1 style={{ margin: "6px 0 14px", color: "#0b2540" }}>パスワード設定</h1>

        <label className="label" htmlFor="pw">新しいパスワード</label>
        <input id="pw" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} placeholder="8文字以上" disabled={busy} />

        <label className="label" htmlFor="pw2" style={{ marginTop: 10 }}>確認用</label>
        <input id="pw2" type="password" value={pw2} onChange={(e)=>setPw2(e.target.value)} disabled={busy} />

        {err && <div className="help" style={{ color: "#b42318", marginTop: 8 }}>{err}</div>}

        <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={busy || !pw || !pw2}>
          {busy ? "更新中..." : "パスワードを確定"}
        </button>
      </form>
    </div>
  );
}
