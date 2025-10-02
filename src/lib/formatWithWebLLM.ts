// src/lib/formatWithWebLLM.ts

/** 校正＆要約プロンプト（日本語） */
export const buildPrompt = (text: string, summaryChars = 100) => `
あなたは日本語の校正アシスタントです。以下の入力文について:

1) 誤字脱字・助詞の誤りを修正する
2) 句読点（「、」「。」）と文末を自然に整える
3) 口語の冗長さや重複を控えめに整理（意味は変えない）
4) 要点を ${summaryChars} 字前後に簡潔に要約する

出力は必ず **次のJSONだけ** を返してください。説明は一切書かないでください:
{"fixed":"修正後の文章","summary":"${summaryChars}字要約"}

入力:
"""${text}"""
`;

/** レスポンスからJSONを安全に抽出（余計な前置き対策） */
function pickJsonBlock(s: string): string | null {
  if (!s) return null;
  const m = s.match(/\{[\s\S]*\}$/);
  return m ? m[0] : (s.trim().startsWith("{") ? s.trim() : null);
}

/** LLMで校正＆要約を実行。失敗時はフォールバックを返す。 */
export async function formatWithWebLLM(
  run: (p: string) => Promise<string>,
  text: string,
  summaryChars = 100
): Promise<{ fixed: string; summary: string }> {
  const raw = await run(buildPrompt(text, summaryChars));
  const jsonLike = pickJsonBlock(raw) ?? raw;
  try {
    const obj = JSON.parse(jsonLike);
    return {
      fixed: String(obj.fixed || "").trim(),
      summary: String(obj.summary || "").trim(),
    };
  } catch {
    // JSONで返ってこなかった場合は、そのまま本文を返す
    return { fixed: text, summary: "" };
  }
}

/* ===== ローカル簡易整形（フォールバック用、サーバなし） ===== */
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
  const fillers = ["えー","えっと","その","あの","まあ","なんか","みたいな","とりあえず","やっぱり","ていうか","なんというか"];
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

/** ルール整形 + 100字サマリ */
export function formatLocal(text: string, summaryChars = 100) {
  let t = text ?? "";
  t = normalizeSymbols(t);
  t = removeFillers(t);
  t = fixCommonMishears(t);
  t = fixSentences(t);

  const s = t.replace(/\s+/g, " ").replace(/[「」『』【】\[\]\(\)]/g, "").trim();
  const summary = s.length <= summaryChars ? s : (s.slice(0, summaryChars - 1) + "…");
  return { fixed: t, summary };
}
