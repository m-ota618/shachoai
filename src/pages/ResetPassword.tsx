// src/pages/ResetPassword.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const nav = useNavigate();

  // ページ状態
  const [sessionReady, setSessionReady] = useState(false); // URLハッシュ取り込み完了
  const [hasSession, setHasSession] = useState(false);     // リンクから来たか判定

  // 入力
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);

  // UI
  const [msg, setMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 初期化：URLハッシュのセッション取り込み完了を待つ
  useEffect(() => {
    let mounted = true;

    // すでに処理されていればそのまま取得
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(!!data.session);
      setSessionReady(true);
    };
    check();

    // 万一遅延する場合に備えてサブスクライブ
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setHasSession(!!s);
      setSessionReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const canSubmit =
    pw.length >= 8 &&
    pw2.length >= 8 &&
    pw === pw2 &&
    !busy &&
    sessionReady &&
    hasSession;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setOkMsg(null);

    if (!hasSession) {
      setMsg("このページはメールのリンクから開いてください。");
      return;
    }
    if (pw.length < 8) {
      setMsg("パスワードは8文字以上で入力してください。");
      return;
    }
    if (pw !== pw2) {
      setMsg("確認用パスワードが一致しません。");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        setMsg(`更新に失敗：${error.message}`);
        return;
      }
      setOkMsg("パスワードを更新しました。");
      // 少し待ってからアプリへ
      setTimeout(() => nav("/app", { replace: true }), 800);
    } catch (e: any) {
      setMsg(`更新に失敗：${e?.message ?? "不明なエラー"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* アプリと共通の固定ヘッダ */}
      <header className="app-header" role="banner">
        <img src="/planter-lockup.svg" alt="Planter" className="brand-lockup" />
        <div className="app-header-divider" />
      </header>

      {/* 中央カードのみ表示 */}
      <main className="auth-center">
        <form className="auth-card" onSubmit={onSubmit} aria-labelledby="rpTitle">
          <h2 id="rpTitle" className="auth-card-title">パスワード再設定</h2>

          {!sessionReady ? (
            <div className="skeleton">リンクを確認しています...</div>
          ) : !hasSession ? (
            <>
              <div className="auth-alert err" role="alert">
                このページは<strong>メールのリンク</strong>から開いてください。<br />
                ログイン画面の「パスワードをお忘れの方」から再度メールを送信できます。
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => nav("/login")}
                >
                  ログインへ戻る
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="label" htmlFor="pw">新しいパスワード</label>
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
                />
                <button
                  type="button"
                  className="input-affix-btn"
                  aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
                  onClick={() => setShowPw(v => !v)}
                  disabled={busy}
                >
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7c-2.6 0-4.9-1.2-6.7-2.9" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    </svg>
                  )}
                </button>
              </div>

              <label className="label" htmlFor="pw2" style={{ marginTop: 10 }}>新しいパスワード（確認）</label>
              <div className="input-group">
                <span className="input-icon" aria-hidden>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <rect x="5" y="10" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" strokeWidth="1.6"/>
                  </svg>
                </span>
                <input
                  id="pw2"
                  type={showPw ? "text" : "password"}
                  placeholder="もう一度入力"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  disabled={busy}
                  className="input"
                  required
                  minLength={8}
                />
              </div>

              <div className="help" style={{ marginTop: 6 }}>
                ・8文字以上 / 推奨：英大文字・小文字・数字の混在<br/>
                ・更新後は自動でアプリに遷移します
              </div>

              {okMsg && <div className="auth-alert ok" role="status">{okMsg}</div>}
              {msg && <div className="auth-alert err" role="alert">{msg}</div>}

              <button type="submit" className="btn btn-primary auth-submit" disabled={!canSubmit}>
                {busy ? <span className="spinner" aria-hidden /> : <span>更新する</span>}
              </button>

              <button
                type="button"
                className="btn btn-secondary auth-alt"
                onClick={() => nav("/login")}
                disabled={busy}
              >
                ログインへ戻る
              </button>
            </>
          )}
        </form>
      </main>
    </>
  );
}
