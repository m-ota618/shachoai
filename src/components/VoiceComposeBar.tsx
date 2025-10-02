// src/components/VoiceComposeBar.tsx
import React, { useRef, useState } from "react";
import { Mic, Square, Wand2, Eraser, Loader2, Copy } from "lucide-react";
import { summarize } from "../api/ai";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** 音声停止で本文が更新された直後に呼ばれる（任意） */
  onCommit?: (text: string) => void | Promise<void>;
};

/**
 * 音声入力 + 要約（Vercel /api/ai → Gemini）
 * - 録音中は入力欄を更新しない（停止で一括反映）
 * - 「要約」ボタンは約100字の要約を取得し、下部に表示（本文は書き換えない）
 */
export default function VoiceComposeBar({ value, onChange, onCommit }: Props) {
  const [recState, setRecState] = useState<"idle" | "recording">("idle");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const bufferRef = useRef<string>("");
  const recRef = useRef<any>(null);

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
          bufferRef.current += r[0].transcript; // 停止まで入力欄には反映しない
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

  const stop = async () => {
    const rec = recRef.current;
    if (rec) rec.stop();
    setRecState("idle");
    setInterim("");
    const add = bufferRef.current.trim();
    bufferRef.current = "";

    if (add) {
      const base = (value || "").trim();
      // 既存本文の末尾が句点/改行でなければ句点を補い、改行で区切って追記
      const needsPeriod = base && !/[。．.!！?？\n]$/.test(base);
      const next = (base ? base + (needsPeriod ? "。" : "") + "\n" : "") + add;
      onChange(next);
      // ここで自動保存などをしたい場合に発火
      if (onCommit) {
        try { await onCommit(next); } catch (e) { console.warn("onCommit failed:", e); }
      }
    }
  };

  /* ========= 要約（/api/ai → Gemini） ========= */
  const handleSummarize = async () => {
    if (!value?.trim() || busy) return;
    setBusy(true);
    try {
      const s = await summarize(value, 100); // 約100字
      setSummary(s);
    } catch (e) {
      console.warn("summarize failed:", e);
      alert("要約の作成に失敗しました。時間をおいて再試行してください。");
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
          onClick={handleSummarize}
          disabled={busy || !value?.trim()}
          title="Geminiで約100字の要約を作成します"
        >
          {busy ? <Loader2 className="icon spin" /> : <Wand2 className="icon" />}
          要約
        </button>

        <button
          className="btn"
          onClick={() => setSummary("")}
          disabled={busy}
        >
          <Eraser className="icon" />
          要約クリア
        </button>
      </div>

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
      `}</style>
    </div>
  );
}
