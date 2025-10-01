import React, { useRef, useState } from "react";
import { Mic, Square, Wand2, Eraser } from "lucide-react";

/**
 * 音声入力 + 文章修正（ゼロ課金・ローカルルールベース）
 * - 録音中は入力欄を更新しない（停止で一括反映）
 * - 「誤字・日本語修正」ボタン:
 *    口癖/冗長の除去、表記ゆれの統一、よくある誤変換の修正、
 *    句読点/文末補正、スペース/改行整理 などを行い、入力欄のテキストを **置換** します
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
  const bufferRef = useRef<string>("");
  const recRef = useRef<any>(null);

  // ====== 音声入力 ======
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
      onChange((value || "") + add); // 録音分をここで初めて追記
    }
    bufferRef.current = "";
  };

  // ====== 修正ルール群 ======
  function normalizeSymbols(t: string): string {
    return t
      .replace(/\r\n?/g, "\n")
      .replace(/\u3000/g, " ") // 全角スペース→半角
      .replace(/，/g, "、")
      .replace(/．/g, "。")
      .replace(/!\s*/g, "！")
      .replace(/\?\s*/g, "？");
  }

  // よくある口癖・冗長語の除去（文頭/区切り語の直後のみ）
  function removeFillers(t: string): string {
    const fillers = [
      "えー","えっと","その","あの","まあ","なんか","みたいな","とりあえず","やっぱり","ていうか","なんというか",
    ];
    fillers.forEach(f => {
      const re = new RegExp(`(^|[\\s、。])${f}(?:[ー〜っ\\s]*)`, "g");
      t = t.replace(re, "$1");
    });
    return t;
  }

  // 音声誤変換・表記ゆれの補正（代表例）
  // 音声誤変換・表記ゆれの補正（代表例）
function fixCommonMishears(t: string): string {
  // すべて「RegExp × string」置換に統一（TS 型エラー回避）
  const rules: Array<[RegExp, string]> = [
    // 仮名遣いの統一（公用文寄り）
    [/下さい/g, "ください"],
    [/下さ(い|ります)/g, "くださ$1"],   // ← 後方参照でサフィックス維持
    [/頂き/g, "いただき"],
    [/頂く/g, "いただく"],
    [/出来る/g, "できる"],
    [/致し/g, "いたし"],
    [/有難うございます?/g, "ありがとうございます"],
    [/宜しくお願いします?/g, "よろしくお願いします"],
    [/すいません/g, "すみません"],
    [/一旦|いったん/g, "いったん"],

    // よくある誤変換
    [/御社さま/g, "御社様"],
    [/お手数おかけします/g, "お手数をおかけします"],
    [/見ず?らい/g, "見づらい"],
    [/わかりずらい|分かりずらい|分かりづらい/g, "分かりづらい"],
    [/目安感/g, "目安"],

    // 助詞の連続や重複スペース
    [/のの/g, "の"],
    [/はは/g, "は"],
    [/[ 　]{2,}/g, " "],
  ];

  for (const [re, rep] of rules) {
    t = t.replace(re, rep);
  }
  return t;
}


  // 文ごとの句読点・文末の補正
  function fixSentences(t: string): string {
    const lines = t.split("\n").map(s => s.trim()).filter((s, i, a) => s.length || a.length === 1);
    const out: string[] = [];
    for (let line of lines) {
      if (!line) { out.push(""); continue; }

      // 文中の読点が無さすぎる長文に軽く「、」を入れる（安全側で控えめ）
      if (line.length >= 28 && !/[、，]/.test(line)) {
        // 「が/ので/から/けど/しかし/そして/また」付近で1回だけ挿入
        line = line.replace(/(が|ので|から|けど|しかし|そして|また)/, "、$1");
      }

      // 文末の句点補完（括弧やカギで終わっていれば付けない）
      if (!/[。！？」）\]\}]$/.test(line)) {
        line = line + "。";
      }
      out.push(line);
    }
    // 連続改行の圧縮
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

  // ====== ボタン：誤字・日本語修正（置換） ======
  const doFixInPlace = () => {
    if (!value?.trim()) return;
    const fixed = fixJapanese(value);
    onChange(fixed); // ← 入力欄の内容を置き換える
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

        <button className="btn" onClick={doFixInPlace} title="誤字・表記ゆれ・句読点を自動修正して置き換えます">
          <Wand2 className="icon" />
          誤字・日本語修正
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
