import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

/**
 * メールリンク着地のハンドラ。
 * - ?code=... が来たら exchangeCodeForSession でセッション確立
 * - #type=recovery は /reset-password に委譲
 * - #type=signup|magiclink|email_change はセッション確立を待って /login へ
 * - タイムアウト時はメッセージを出して /login へ誘導
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const [msg, setMsg] = useState("ログイン処理中…");
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;

    const run = async () => {
      try {
        // 1) パラメータ取得
        const url = new URL(window.location.href);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
        const qs = url.searchParams;

        const flow = qs.get("flow") || "";          // e.g. signup / magic
        const type = hash.get("type") || "";        // e.g. signup / recovery / magiclink / email_change
        const hasCode = !!qs.get("code");           // query型リンク
        const hasAccessToken = !!hash.get("access_token"); // hash型リンク

        // 2) パスワード再設定は専用画面へ委譲
        if (type === "recovery" || flow === "recovery") {
          // 元のハッシュも渡す（#type=recovery, access_token など）
          nav(`/reset-password?flow=recovery${window.location.hash}`, { replace: true });
          return;
        }

        // 3) code 型（?code=...）なら Supabase に処理させる
        if (hasCode) {
          setMsg("セッションを確立しています…");
          // v2: 現在のURLを渡すだけでOK（内部で code を取り込み）
          const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) {
            setMsg(`セッション確立に失敗しました：${error.message}`);
            // 失敗してもログインへ誘導
            setTimeout(() => nav("/login", { replace: true }), 1200);
            return;
          }
          // 成功 → ログインへ
          setMsg("メール確認が完了しました。ログインしてください。");
          setTimeout(() => nav("/login", { replace: true }), 600);
          return;
        }

        // 4) hash 型（#access_token=...）は SDK が取り込むのを待つ
        if (hasAccessToken || type === "signup" || flow === "signup" || type === "magiclink" || type === "email_change") {
          setMsg("セッションを確立しています…");

          // onAuthStateChange で SIGNED_IN を待つ + フェイルセーフでポーリング
          const stopAt = Date.now() + 8000; // 最大8秒待機
          const unsub = supabase.auth.onAuthStateChange((_e, session) => {
            if (!alive.current) return;
            if (session) {
              unsub.data.subscription.unsubscribe();
              setMsg("メール確認が完了しました。ログインしてください。");
              setTimeout(() => nav("/login", { replace: true }), 400);
            }
          });

          // フェイルセーフ：ポーリングでも確認
          while (Date.now() < stopAt) {
            const { data } = await supabase.auth.getSession();
            if (!alive.current) return;
            if (data.session) {
              unsub.data.subscription.unsubscribe();
              setMsg("メール確認が完了しました。ログインしてください。");
              setTimeout(() => nav("/login", { replace: true }), 400);
              return;
            }
            await new Promise((r) => setTimeout(r, 400));
          }

          // タイムアウト
          unsub.data.subscription.unsubscribe();
          setMsg("認証に時間がかかっています。リンクをもう一度開くか、ページを再読み込みしてください。");
          return;
        }

        // 5) どの形式でもない → ログインへ
        setMsg("不明なリンクです。ログイン画面へ戻ります。");
        setTimeout(() => nav("/login", { replace: true }), 800);
      } catch (e: any) {
        setMsg(`エラーが発生しました：${e?.message ?? "不明なエラー"}`);
        setTimeout(() => nav("/login", { replace: true }), 1200);
      }
    };

    run();
    return () => { alive.current = false; };
  }, [loc, nav]);

  return (
    <main className="content">
      <div className="wrap">
        <div className="skeleton">{msg}</div>
      </div>
    </main>
  );
}
