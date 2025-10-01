import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, Wand2 } from "lucide-react";

/**
 * 回答が「質問に対して適切か」を即席で評価するウィジェット。
 * - デフォはゼロ課金（ローカル整形ルール + 簡易ヒューリスティック）
 * - formatEndpoint と同様に checkEndpoint を与えると、ローカルLLM(Ollama)で高精度チェック
 */
export default function AnswerCheck({
  question,
  answer,
  onApplySuggestion,
  checkEndpoint,
}: {
  question: string;
  answer: string;
  onApplySuggestion?: (fixed: string) => void;
  checkEndpoint?: string; // 例 "/api/check"
}) {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<null | {
    pass: boolean;
    score: number; // 0-100
    verdict: "YES" | "PARTIAL" | "NO";
    missing: string[];
    hallucination: boolean;
    suggestion?: string;
    notes?: string;
  }>(null);

  const heuristicCheck = () => {
    // 簡易ヒューリスティック：疑問詞・キーワード一致度など
    const q = (question || "").toLowerCase();
    const a = (answer || "").toLowerCase();
    let score = 0;
    // 1) 疑問詞/命題の検出
    const intents = [
      "いつ",
      "どこ",
      "だれ",
      "誰",
      "なに",
      "何",
      "なぜ",
      "どうやって",
      "方法",
      "手順",
      "比較",
      "条件",
      "費用",
      "料金",
      "期間",
      "期限",
      "必要",
      "できますか",
      "できます",
      "可能",
    ];
    const intentHit = intents.some((w) => q.includes(w));
    // 2) 共通キーワード（名詞っぽいトークン）
    const tokens = q.split(/[\s、。・,]/).filter((t) => t.length >= 2);
    const hit = tokens.filter((t) => a.includes(t));
    const coverage = tokens.length ? hit.length / Math.min(tokens.length, 10) : 0;
    // 3) 直接応答らしさ（です/ます・箇条書き頭・数値）
    const direct = /(です|ます|できます|は.*です|^[-*・]|\d)/.test(answer);
    score = Math.round(coverage * 70 + (direct ? 20 : 0) + (intentHit ? 10 : 0));
    const pass = score >= 70;
    const verdict = pass ? (score >= 85 ? "YES" : "PARTIAL") : "NO";
    const missing = tokens.filter((t) => !a.includes(t)).slice(0, 5);
    setRes({
      pass,
      score,
      verdict,
      missing,
      hallucination: false,
      suggestion: pass ? undefined : makeSuggestion(question, answer, missing),
    });
  };

  function makeSuggestion(q: string, a: string, missing: string[]): string {
    // 足りないキーワードを箇条書きに誘導
    const lines = [
      "### 回答の補強案",
      "- 冒頭に結論（はい/いいえ/要点）を明記",
      "- 箇条書きで条件・手順・金額などを整理",
      missing.length ? `- 以下の語を明示: ${missing.join("、")}` : "",
    ];
    return lines.filter(Boolean).join("\n");
  }

  const run = async () => {
    if (!question?.trim() || !answer?.trim()) return;
    if (!checkEndpoint) {
      heuristicCheck();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(checkEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      const json = await res.json();
      setRes(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ac">
      <button className="btn" onClick={run} disabled={loading}>
        {loading ? "チェック中…" : (<><Wand2 className="icon" />回答をチェック</>)}
      </button>
      {res && (
        <div className={`panel ${res.pass ? "ok" : "ng"}`}>
          <div className="head">
            {res.pass ? <CheckCircle2 className="icon" /> : <AlertTriangle className="icon" />}
            <strong>{res.verdict}</strong>
            <span className="score">score {res.score}/100</span>
          </div>
          {res.missing?.length ? (
            <div className="sec">
              <div className="ttl">不足している観点</div>
              <ul>{res.missing.map((m, i) => (<li key={i}>{m}</li>))}</ul>
            </div>
          ) : null}
          {res.suggestion && (
            <div className="sec">
              <div className="ttl">改善提案</div>
              <pre className="pre">{res.suggestion}</pre>
              {onApplySuggestion && (
                <button className="btn" onClick={() => onApplySuggestion(res.suggestion!)}>
                  改善案を回答欄に挿入
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <style>{`
        .ac { margin-top: 8px; }
        .btn { display:inline-flex; align-items:center; gap:6px; border:1px solid #ddd; padding:6px 10px; border-radius:8px; background:#fff; cursor:pointer; }
        .btn:hover { background:#f8f8f8; }
        .icon{ width:16px; height:16px; }
        .panel{ margin-top:8px; border:1px solid #e5e7eb; border-radius:8px; padding:8px; background:#fff; }
        .panel.ok{ border-color:#c7f2cf; background:#f5fff7; }
        .panel.ng{ border-color:#ffe2c7; background:#fffaf5; }
        .head{ display:flex; align-items:center; gap:8px; }
        .score{ margin-left:auto; font-size:12px; color:#666; }
        .sec{ margin-top:6px; }
        .ttl{ font-weight:600; margin-bottom:2px; }
        .pre{ white-space:pre-wrap; background:#f7f7f7; padding:6px; border-radius:6px; }
      `}</style>
    </div>
  );
}
