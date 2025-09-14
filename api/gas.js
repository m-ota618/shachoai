// api/gas.js  ← Vercel Node 関数（ESM: default export）
import { createClient } from '@supabase/supabase-js';

function setCors(req, res) {
  const origin = String((req.headers && req.headers.origin) || '');
  const allow = (process.env.ALLOW_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (allow.length) {
    if (allow.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).send('method_not_allowed');

  // 必須ENV
  const ENDPOINT = process.env.GAS_ENDPOINT;
  const API_TOKEN = process.env.API_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.SUPABASE_ANON;
  const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const miss = [];
  if (!ENDPOINT) miss.push('GAS_ENDPOINT');
  if (!API_TOKEN) miss.push('API_TOKEN');
  if (!SUPABASE_URL) miss.push('SUPABASE_URL');
  if (!SUPABASE_ANON) miss.push('SUPABASE_ANON');
  if (miss.length) return res.status(500).send(`missing_env: ${miss.join(',')}`);

  // Bearer必須（Supabaseセッション）
  const authz = String(req.headers?.authorization || '');
  if (!authz.startsWith('Bearer ')) return res.status(401).send('missing_bearer');
  const accessToken = authz.slice(7);

  // Supabaseでトークン検証＆メールドメイン制限
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user) return res.status(401).send('unauthorized');

    const email = (data.user.email || '').toLowerCase();
    if (ALLOWED_EMAIL_DOMAINS.length) {
      const ok = ALLOWED_EMAIL_DOMAINS.some((dom) =>
        email.endsWith(`@${dom}`) || email.endsWith(dom)
      );
      if (!ok) return res.status(403).send('forbidden_domain');
    }
  } catch (e) {
    return res.status(500).send(`supabase_init_failed: ${e?.message || e}`);
  }

  // フロントのJSONボディ
  let body = {};
  try {
    body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};
  } catch {
    body = {};
  }

  // GASへ中継（x-www-form-urlencoded）
  try {
    const params = new URLSearchParams();
    if (body.action) params.set('action', String(body.action));
    params.set('token', API_TOKEN);
    if (body.payload != null) {
      params.set(
        'payload',
        typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload)
      );
    }

    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const text = await r.text();
    res.status(r.status);
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    return res.send(text);
  } catch (e) {
    return res.status(502).send(`fetch_to_gas_failed: ${e?.message || e}`);
  }
}
