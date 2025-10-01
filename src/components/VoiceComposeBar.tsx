import React, { useRef, useState } from "react";
import { Mic, Square, Wand2, Eraser } from "lucide-react";

/**
 * 単独話者向け：音声入力＋（整形＋要約）一括
 * - 音声入力: Web Speech API（Chrome前提）
 * - 録音中は入力欄を更新しない（停止で一括反映）
 * - 「整形＋要約」: 句読点補正・体裁整形 → 100字要約を末尾に追記（ゼロ課金）
 */
export default function VoiceComposeBar({
  value,
  onChange,
  summarizeChars = 100,
}: {
  value: string;
  onChange: (v: string) => void;
  summarizeChars?: number;
}) {
  const [recState, setRecState] = useState<"idle" | "recording">("idle");
  const [interim, setInterim] = useState("");
  const bufferRef = useRef<string>(""); // 停止するまでの最終確定テキストを貯める
  const recRef = useRef<any>(null);

  // ====== 音声入力 ======
  const start = () => {
    // @ts-ignore
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("このブラウザは音声認識に未対応です。Chromeを推奨します。");
      return;
    }
    bufferRef.current = ""; // 新規録音のたびにバッファを空に
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
          bufferRef.current += r[0].transcript; // ← 入力欄には反映しない
        } else {
          it += r[0].transcript;
        }
      }
      setInterim(it); // 進行中の見た目だけ
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
    // 停止したタイミングで初めて入力欄に反映
    const add = bufferRef.current.trim();
    if (add) {
      onChange((value || "") + add);
    }
    bufferRef.current = "";
  };

  // ====== 整形（句読点・体裁） ======
  function localFormat(text: string): string {
    let t = text ?? "";
    if (!t.trim()) return t;

    // 改行統一
    t = t.replace(/\r\n?/g, "\n");

    // 口癖・冗長
    const fillers = ["えー", "その", "まあ", "なんか", "えっと", "あの", "みたいな", "とりあえず", "やっぱり"];
    fillers.forEach(f => {
      const re = new RegExp(`(^|[\\s、。])${f}(?:[\\u3063\\u30FC\\s]*)?`, "g");
      t = t.replace(re, "$1");
    });

    // 記号正規化
    t = t
      .replace(/\u3000/g, " ")
      .replace(/，/g, "、")
      .replace(/．/g, "。")
      .replace(/!\s*/g, "！")
      .replace(/\?\s*/g, "？");

    // 行ごとに句点補完
    t = t
      .split("\n")
      .map(line => {
        const s = line.trim();
        if (!s) return "";
        if (/[。！？」）\]\}、]$/.test(s)) return s;
        return s + "。";
      })
      .join("\n");

    // 連続改行圧縮・空白整理
    t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
    return t.trim();
  }

  // ====== 要約（100字目安の素朴抽出） ======
  function localSummarize(text: string, maxChars: number): string {
    const src = localFormat(text);
    if (!src) return "";

    const sentences = src
      .split(/(?:。|！|？|\n)+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (sentences.length === 0) return "";

    const stop = new Set(["は","が","を","に","で","と","も","へ","の","や","から","まで","より","そして","また","ため","ので","です","ます","でした"]);
    const freq: Record<string, number> = {};
    sentences.forEach(s => {
      s.replace(/[^\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\w]/gu, " ")
        .split(/\s+/)
        .filter(w => w && !stop.has(w) && w.length >= 2)
        .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    });
    const score = (s: string) =>
      s.split(/\s+/).reduce((acc, w) => acc + (freq[w] || 0), 0) + Math.min(10, s.length / 8);

    const ranked = sentences
      .map((s, idx) => ({ s, idx, sc: score(s) }))
      .sort((a, b) => b.sc - a.sc || a.idx - b.idx);

    let out: string[] = [];
    let total = 0;
    for (const r of ranked) {
      const add = r.s + "。";
      if (total + add.length > maxChars && out.length > 0) continue;
      out.push(add);
      total += add.length;
      if (total >= maxChars) break;
    }
    if (out.length === 0) out = [sentences[0] + "。"];
    return out.join("").trim();
  }

  // ====== ボタン：整形＋要約（1アクション） ======
  const doFormatAndSummarize = () => {
    if (!value?.trim()) return;
    const formatted = localFormat(value);
    const summary = localSummarize(formatted, summarizeChars);
    const next = `${formatted}\n\n【要約（約${summarizeChars}字）】\n${summary}`;
    onChange(next);
  };

  return (
    <div className="vcb">
      <div className="vcb-row">
        {recState === "idle" ? (
          <button className="btn btn-future" onClick={start}>
            <Mic className="icon" />音声入力
          </button>
        ) : (
          <button className="btn btn-danger" onClick={stop}>
            <Square className="icon" />停止
          </button>
        )}

        <button className="btn" onClick={doFormatAndSummarize}>
          <Wand2 className="icon" />
          整形＋要約
        </button>

        <button className="btn" onClick={() => onChange("")}>
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

      <style>{`
        .vcb { margin-top: 8px; }
        .vcb-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .btn { display:inline-flex; align-items:center; gap:6px; border:1px solid #ddd; padding:6px 10px; border-radius:8px; background:#fff; cursor:pointer; }
        .btn:hover { background:#f8f8f8; }
        .btn-danger { background:#ffecec; border-color:#ffbdbd; }
        .btn-future { background:#eef7ff; border-color:#bcdcff; }
        .icon { width:16px; height:16px; }
        .vcb-interim { font-size:12px; color:#666; padding:4px 0; }
      `}</style>
    </div>
  );
}
