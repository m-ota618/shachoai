// /api/ai.ts — Vercel Serverless Function (TypeScript)
import type { VercelRequest, VercelResponse } from '@vercel/node';

function cors(req: VercelRequest, res: VercelResponse) {
  const allow = (process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = String(req.headers.origin || '');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type');
  if (allow.length) {
    if (allow.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}

function normalizeModel(m?: string) {
  const raw = (m || '').trim();
  if (!raw) return 'gemini-1.5-flash';
  return raw.replace(/^models\//i, '');
}

const MODEL = normalizeModel(process.env.GEMINI_MODEL);
const API_KEY = process.env.GEMINI_API_KEY;

function extractText(data: any): string {
  // A) まず最近の形
  const a = String(data?.candidates?.[0]?.output_text || '').trim();
  if (a) return a;
  // B) 以前の形
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const b = parts.map((p: any) => (p?.text ? String(p.text) : '')).filter(Boolean).join('\n').trim();
  return b;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    if (!API_KEY) return res.status(500).json({ ok: false, error: 'missing_api_key' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = String(body?.text || '').trim();
    const maxChars = Math.max(40, Math.min(300, Number(body?.maxChars || body?.targetChars || 100)));
    if (!text) return res.status(400).json({ ok: false, error: 'missing_text' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const prompt = [
      "以下の日本語の原文を、意味を保ちながら自然な書き言葉に整えてから要約してください。",
      "指示:",
      "1. 相づち・言いよどみ・口癖（例: えーと、あの、えっと、まあ、なんか、ていうか、うーん、みたいな）はすべて削除する。",
      "2. 文を簡潔に整理し、因果関係や時系列を保つ。",
      "3. 絵文字・顔文字・記号・ノイズ語（うーん、ええと、はい、そうですね等）は含めない。",
      "4. 丁寧語・普通体のままでもよいが、文体は統一し、文末を整える。",
      `5. 100文字以内で1段落にまとめ、改行・箇条書き・ラベルを使わない。`,
      "",
      "出力は要約本文のみ。前後に説明文や引用符を付けない。",
      "----",
      text
    ].join("\\n");


    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: Number(process.env.SUMMARY_MAX_TOKENS ?? 1024),
        response_mime_type: 'text/plain',
        },
      // safetySettings は指定しない（400の原因になりやすい）
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY as string },
      body: JSON.stringify(payload),
    });

    const ct = r.headers.get('content-type') || '';
    const raw = await r.text();

    if (!r.ok) {
      console.error('gemini_http_error', r.status, raw.slice(0, 400));
      return res.status(502).json({ ok: false, error: 'gemini_http_error', status: r.status });
    }

    const data = ct.includes('json') ? JSON.parse(raw) : {};
    const block = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    if (block && String(block).toUpperCase().includes('SAFETY')) {
      return res.status(400).json({ ok: false, error: 'blocked_safety', reason: block });
    }

    const summary = extractText(data);
    const finish = data?.candidates?.[0]?.finishReason;
    if (!summary) {
    return res.status(400).json({
        ok: false,
        error: 'empty_model_output',
        reason: String(finish || data?.promptFeedback?.blockReason || 'UNKNOWN'),
        usage: data?.usageMetadata,
    });
    }

    const trimmed = summary.length > maxChars ? summary.slice(0, maxChars - 1) + '…' : summary;
    return res.status(200).json({ ok: true, summary: trimmed });
  } catch (e: any) {
    console.error('ai_handler_error', e?.message || e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}
