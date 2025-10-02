// api/ai.ts  — Vercel Serverless Function (TypeScript)
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const API_KEY = process.env.GEMINI_API_KEY; // ← Vercel の環境変数に設定する

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    if (!API_KEY) return res.status(500).json({ ok: false, error: 'missing_api_key' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const text = String(body?.text || '').trim();
    const maxChars = Math.max(40, Math.min(300, Number(body?.maxChars || 100)));

    if (!text) return res.status(400).json({ ok: false, error: 'missing_text' });

    // Gemini へのリクエスト
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const prompt = [
      `次の日本語テキストを ${maxChars} 文字以内で一段落に要約してください。`,
      `数値・固有名詞はできるだけ保持し、断定を避け、文は自然な日本語で。`,
      `出力は要約文のみ。前後に余分な語句やラベルは付けない。`,
      `---`,
      text
    ].join('\n');

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
        response_mime_type: 'text/plain',
      },
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const ct = r.headers.get('content-type') || '';
    const raw = await r.text();
    if (!r.ok) {
      console.error('gemini_error', r.status, raw.slice(0, 300));
      return res.status(502).json({ ok: false, error: 'gemini_http_error', status: r.status });
    }

    const data = ct.includes('json') ? JSON.parse(raw) : {};
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const summary: string =
      parts.map((p: any) => (p?.text ? String(p.text) : ''))
           .filter(Boolean)
           .join('\n')
           .trim();

    if (!summary) return res.status(502).json({ ok: false, error: 'empty_summary' });

    // 文字数ガード（超えたらカット）
    const trimmed = summary.length > maxChars ? summary.slice(0, maxChars - 1) + '…' : summary;

    return res.status(200).json({ ok: true, summary: trimmed });
  } catch (e: any) {
    console.error('ai_handler_error', e?.message || e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
}
