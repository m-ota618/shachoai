// src/components/VoiceComposeBar.tsx
import React, { useRef, useState } from "react";
import { Mic, Square, Wand2, Eraser, Loader2, Copy } from "lucide-react";
import { formatText } from "../api/gas";

/**
 * 音声入力 + 文章「要約＆整形」
 * - 録音中は入力欄を更新しない（停止で一括反映）
 * - 「要約＆整形」: まず GAS(Gemini)で誤字・句読点・日本語を校正＆100字要約
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
          // 停止まで入力欄には反映しない（バッファに貯める）
          bufferRef.current += r[0].transcript;
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
      const base = (value || "").trim();
      const needsNewline = base.length > 0 && !/\n$/.test(base);
      onChange((base + (needsNewline ? "\n" : "") + add).trim());
    }
    bufferRef.current = "";
  };

  /* ========= ローカル整形（フォールバック） ========= */
  function normalizeSymbols(t: string): string {
    return t
      .replace(/\r\n?/g, "\n")
      .replace(/\u3000/g, " ")
      .replace(/，/g, "、")
      .replace(/．/g, "。")
      .replace(/!\s*/g, "！")
      .replace(/\?\s*/g, "？");
  }
  function removeFillers(t: string): string {
    const fillers = ["えー", "えっと", "その", "あの", "まあ", "なんか", "みたいな", "とりあえず", "やっぱり", "ていうか", "なんというか"];
    fillers.forEach((f) => {
      const re = new RegExp(`(^|[\\s、。])${f}(?:[ー〜っ\\s]*)`, "g");
      t = t.replace(re, "$1");
    });
    return t;
  }
  function fixCommonMishears(t: string): string {
    const rules: Array<[RegExp, string]> = [
      [/下さい/g, "ください"],
      [/下さ(い|ります)/g, "くださ$1"],
      [/頂き/g, "いただき"],
      [/頂く/g, "いただく"],
      [/出来る/g, "できる"],
      [/致し/g, "いたし"],
      [/有難うございます?/g, "ありがとうございます"],
      [/宜しくお願いします?/g, "よろしくお願いします"],
      [/すいません/g, "すみません"],
      [/一旦|いったん/g, "いったん"],
      [/御社さま/g, "御社様"],
      [/お手数おかけします/g, "お手数をおかけします"],
      [/見ず?らい/g, "見づらい"],
      [/わかりずらい|分かりずらい|分かりづらい/g, "分かりづらい"],
      [/目安感/g, "目安"],
      [/のの/g, "の"],
      [/はは/g, "は"],
      [/[ 　]{2,}/g, " "],
    ];
    for (const [re, rep] of rules) t = t.replace(re, rep);
    return t;
  }
  function fixSentences(t: string): string {
    const lines = t.split("\n").map((s) => s.trim()).filter((s, i, a) => s.length || a.length === 1);
    const out: string[] = [];
    for (let line of lines) {
      if (!line) { out.push(""); continue; }
      if (line.length >= 28 && !/[、，]/.test(line)) {
        line = line.replace(/(が|ので|から|けど|しかし|そして|また)/, "、$1");
      }
      if (!/[。！？」）\]\}]$/.test(line)) line = line + "。";
      out.push(line);
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function fixJapanese(text: string): string {
    let t = text ?? "";
    if (!t.trim()) return t;
    t = normalizeSymbols(t);
    t = removeFillers(t);
    t = fixCommonMishears(t);
    t = fixSentences(t);
    return t;
  }
  function summarizeLocal(t: string, n = 100): string {
    const s = (t || "").replace(/\s+/g, " ").replace(/[「」『』【】\[\]\(\)]/g, "").trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "…";
  }

  /* ========= 要約＆整形（Gemini→fallback） ========= */
  const handleFormat = async () => {
    if (!value?.trim() || busy) return;
    setBusy(true);
    try {
      // ① GAS(Gemini)で校正＋100字要約
      const r = await formatText(value, 100);
      if (r && (r as any).ok && (r as any).fixed) {
        onChange((r as any).fixed);
        setSummary((r as any).summary || "");
      } else if ((r as any)?.corrected || (r as any)?.summary) {
        // summarizeText 形の返り値でも受けられる保険
        onChange((r as any).corrected || value);
        setSummary((r as any).summary || summarizeLocal((r as any).corrected || value, 100));
      } else {
        // ② フォールバック：ローカル
        const fixed = fixJapanese(value);
        onChange(fixed);
        setSummary(summarizeLocal(fixed, 100));
      }
    } catch (e) {
      console.warn("formatText error:", e);
      const fixed = fixJapanese(value);
      onChange(fixed);
      setSummary(summarizeLocal(fixed, 100));
      // 通知は控えめに（アラートは出さない）
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
          title="誤字・句読点・日本語を校正し、100字要約を作成"
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
