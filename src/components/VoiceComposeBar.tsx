// src/components/VoiceComposeBar.tsx
import React, { useRef, useState } from "react";
import { Mic, Square, Wand2, Eraser, Loader2, Copy, Sparkles } from "lucide-react";
import { useWebLLM } from "../lib/useWebLLM";
import { formatWithWebLLM, formatLocal } from "../lib/formatWithWebLLM";

/**
 * 音声入力 + 文章「要約＆整形」（WebLLM/サーバ不要）
 * - 録音中は入力欄を更新しない（停止で一括反映）
 * - 「要約＆整形」: まず WebLLM で誤字・句読点・日本語を校正＆100字要約
 *   フォールバック: ローカル簡易整形 + 100字要約
 * - 整形結果は入力欄を **置換**（追記しない）
 */
export default function VoiceComposeBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [recState, setRecState] = useState<"idle" | "recording">("idle");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const bufferRef = useRef<string>("");
  const recRef = useRef<any>(null);

  // WebLLM 準備
  const { ready, loadingMsg, error, run, webgpuOK } = useWebLLM();

  /* ========= 音声入力 ========= */
  const start = () => {
    // @ts-ignore
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("このブラウザは音声認識に未対応です。Chromeを推奨します。");
      return;
    }
    bufferRef.current = "";
    setInterim("");

    const rec = new SR();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (e: any) => {
      let it = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          bufferRef.current += r[0].transcript; // ← 停止まで入力欄には入れない
        } else {
          it += r[0].transcript;
        }
      }
      setInterim(it);
    };

    rec.onerror = (e: any) => console.error("speech error", e);
    rec.onend = () => setRecState("idle");
    rec.start();
    recRef.current = rec;
    setRecState("recording");
  };

  const stop = () => {
    const rec = recRef.current;
    if (rec) rec.stop();
    setRecState("idle");
    setInterim("");
    const add = bufferRef.current.trim();
    if (add) {
      // 入力欄末尾が句点や改行で終わっていなければ句点や改行で接続
      const base = (value || "").trim();
      const needGlue = base && !/[。\n]$/.test(base);
      const next = [base, needGlue ? "。" : "", base ? "\n" : "", add].join("").trim();
      onChange(next);
    }
    bufferRef.current = "";
  };

  /* ========= 要約＆整形（WebLLM→fallback） ========= */
  const handleFormat = async () => {
    if (!value?.trim() || busy) return;
    setBusy(true);
    try {
      if (ready) {
        const r = await formatWithWebLLM(run, value, 100);
        if (r.fixed?.trim()) onChange(r.fixed.trim());
        setSummary(r.summary || "");
      } else {
        // 未準備またはWebGPU不可→ローカル整形
        const r = formatLocal(value, 100);
        onChange(r.fixed);
        setSummary(r.summary);
      }
    } catch (e) {
      console.warn("WebLLM format error:", e);
      const r = formatLocal(value, 100);
      onChange(r.fixed);
      setSummary(r.summary);
      // ここでアラートは出さず静かにフォールバック（UX重視）
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vcb">
      <div className="vcb-row">
        {recState === "idle" ? (
          <button className="btn btn-future" onClick={start} disabled={busy}>
            <Mic className="icon" />音声入力
          </button>
        ) : (
          <button className="btn btn-danger" onClick={stop}>
            <Square className="icon" />停止
          </button>
        )}

        <button
          className="btn"
          onClick={handleFormat}
          disabled={busy || !value?.trim()}
          title="誤字・句読点・日本語を校正し、100字要約を作成（WebLLM/サーバ不要）"
        >
          {busy ? <Loader2 className="icon spin" /> : <Wand2 className="icon" />}
          要約＆整形
        </button>

        <button
          className="btn"
          onClick={() => { onChange(""); setSummary(""); }}
          disabled={busy}
        >
          <Eraser className="icon" />
          クリア
        </button>
      </div>

      {/* モデルロード状況 */}
      {!ready && (
        <div className="vcb-hint">
          <Sparkles className="icon" />
          {error
            ? `LLM初期化エラー: ${error}`
            : (webgpuOK
                ? loadingMsg
                : "このブラウザはWebGPUに未対応です。最新のChrome/Edgeをご利用ください。")}
        </div>
      )}

      {/* 録音中の一時表示（入力欄には反映しない） */}
      {interim && recState === "recording" && (
        <div className="vcb-interim" aria-live="polite">
          {interim}
        </div>
      )}

      {/* 要約プレビュー */}
      {summary && (
        <div className="vcb-summary">
          <div className="vcb-summary-head">
            <span>要約（約100字）</span>
            <button
              className="chip"
              onClick={async () => {
                try { await navigator.clipboard.writeText(summary); alert("要約をコピーしました"); }
                catch { alert("コピーに失敗しました"); }
              }}
              aria-label="要約をコピー"
            >
              <Copy className="icon" /> コピー
            </button>
          </div>
          <div className="vcb-summary-body">{summary}</div>
        </div>
      )}

      <style>{`
        .vcb { margin-top: 8px; }
        .vcb-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .btn { display:inline-flex; align-items:center; gap:6px; border:1px solid #ddd; padding:6px 10px; border-radius:8px; background:#fff; cursor:pointer; }
        .btn:hover { background:#f8f8f8; }
        .btn[disabled] { opacity:.6; cursor:not-allowed; }
        .btn-danger { background:#ffecec; border-color:#ffbdbd; }
        .btn-future { background:#eef7ff; border-color:#bcdcff; }
        .icon { width:16px; height:16px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .vcb-interim { font-size:12px; color:#666; padding:4px 0; }
        .vcb-summary { margin-top:8px; border:1px solid #eee; border-radius:8px; padding:8px; background:#fafafa; }
        .vcb-summary-head { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#555; margin-bottom:6px; }
        .vcb-summary-body { font-size:13px; line-height:1.6; white-space:pre-wrap; }
        .chip { display:inline-flex; align-items:center; gap:6px; border:1px solid #ddd; padding:4px 8px; border-radius:999px; background:#fff; cursor:pointer; font-size:12px; }
        .chip:hover { background:#f5f5f5; }
        .vcb-hint { margin-top:6px; font-size:12px; color:#666; display:flex; align-items:center; gap:6px; }
      `}</style>
    </div>
  );
}
