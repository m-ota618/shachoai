// api/gas.js  ← Vercel Node 関数（ESM: default export）
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';

/* ==================== constants ==================== */
const MAX_PAYLOAD_BYTES = 256 * 1024; // 256KB（DoS/誤送信対策）

// 最小限のアクション・バリデータ（必要に応じて拡張）
const ACTION_VALIDATORS = {
  getUnanswered: () => true,
  getDrafts: () => true,
  getDetail: (p) => Number.isInteger(Number(p?.row)),
  saveAnswer: (p) =>
    Number.isInteger(Number(p?.row)) &&
    typeof p?.answer === 'string' &&
    typeof (p?.url ?? '') === 'string',
  completeFromWeb: (p) => Number.isInteger(Number(p?.row)),
  noChangeFromWeb: (p) => Number.isInteger(Number(p?.row)),
  getHistoryList: () => true,
  getHistoryDetail: (p) => Number.isInteger(Number(p?.row)),
  getAllTopicOptionsPinnedFirst: (p) => !p || Object.keys(p).length === 0,
  getUpdateData: (p) => {
    if (!p || typeof p !== 'object') return false;
    const types =
      (p.q == null || typeof p.q === 'string') &&
      (p.topicKey == null || typeof p.topicKey === 'string') &&
      (p.topics == null || Array.isArray(p.topics)) &&
      (p.area == null || typeof p.area === 'string') &&
      (p.limit == null || Number.isInteger(Number(p.limit))) &&
      (p.offset == null || Number.isInteger(Number(p.offset))) &&
      (p.pinnedFirst == null || typeof p.pinnedFirst === 'boolean');
    return types;
  },
  saveUpdateRow: (p) =>
    Number.isInteger(Number(p?.row)) &&
    p?.payload &&
    typeof p.payload === 'object' &&
    typeof (p.payload.answer ?? '') === 'string' &&
    typeof (p.payload.url ?? '') === 'string',
  syncToMiibo: (p) => !p || Object.keys(p).length === 0,
  syncToMiobo: (p) => !p || Object.keys(p).length === 0, // タイポ互換
  bulkCompleteDrafts: (p) => {
    if (!p) return true;
    if (typeof p !== 'object') return false;
    if (p.dryRun != null && typeof p.dryRun !== 'boolean') return false;
    if (p.limit != null && !Number.isInteger(Number(p.limit))) return false;
    return true;
  },
  predictAnswerForRow: (p) => Number.isInteger(Number(p?.row)),
};

/* ==================== helpers ==================== */
function newTraceId(req) {
  const fromHeader = req.headers?.['x-trace-id'];
  if (fromHeader && String(fromHeader).trim()) return String(fromHeader).trim();
  try { return randomUUID(); } catch { return randomBytes(16).toString('hex'); }
}

function log(level, obj) {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...obj });
  if (level === 'error') console.error(line);
  else console.log(line);
}

function setCors(req, res) {
  const origin = String((req.headers && req.headers.origin) || '');
  const allow = (process.env.ALLOW_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trace-Id, X-Tenant-Id');
  // x-trace-id / X-Build をフロントで読めるように露出
  res.setHeader('Access-Control-Expose-Headers', 'X-Trace-Id, x-trace-id, X-Build, Content-Type');

  if (allow.length) {
    if (allow.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}

function setTraceHeaders(res, traceId) {
  // ツール差異を吸収するため大小どちらのヘッダ名も付ける（冪等）
  res.setHeader('X-Trace-Id', traceId);
  res.setHeader('x-trace-id', traceId);
  const sha = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
  if (sha) res.setHeader('X-Build', sha);
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return req.body || {};
}

function badRequest(res, traceId, code = 'bad_request', extra = {}) {
  log('error', { traceId, where: 'input', msg: code, ...extra });
  return res.status(400).json({ error: code, traceId });
}

function payloadTooLarge(res, traceId, size) {
  log('error', { traceId, where: 'input', msg: 'payload_too_large', size });
  return res.status(413).json({ error: 'payload_too_large', traceId });
}

/* ================ tenant resolver ================ */
async function resolveTenant({ userDomain, headerTenantId, traceId }) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

  if (!SUPABASE_SERVICE_ROLE) {
    // 互換モード（テナント解決をスキップしてENVを使う）
    return null;
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      db: { schema: 'private' }, // private.tenants
    });

    // 1) ヘッダ指定（管理者UI向け）を最優先
    if (headerTenantId) {
      const { data, error } = await admin
        .from('tenants')
        .select('id, display_name, domain, include_subdomains, gas_endpoint, gas_token, enabled')
        .eq('enabled', true)
        .eq('id', headerTenantId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    }

    // 2) メールドメインで解決（exact > subdomain）
    const { data: rows, error: e2 } = await admin
      .from('tenants')
      .select('id, display_name, domain, include_subdomains, gas_endpoint, gas_token, enabled')
      .eq('enabled', true)
      .limit(200);
    if (e2) throw e2;

    const d = String(userDomain || '').toLowerCase();
    const exact = (rows || []).find(r => String(r.domain || '').toLowerCase() === d);
    if (exact) return exact;

    const sub = (rows || []).find(r =>
      r.include_subdomains &&
      (d === String(r.domain || '').toLowerCase() ||
       d.endsWith('.' + String(r.domain || '').toLowerCase()))
    );
    if (sub) return sub;

    return null;
  } catch (e) {
    log('error', { traceId, where: 'tenant', msg: 'resolve_failed', err: String(e) });
    return null;
  }
}

/* ==================== main ==================== */
export default async function handler(req, res) {
  const t0 = Date.now();
  setCors(req, res);

  // 最初に採番 → 全レスに必ず付与
  const traceId = newTraceId(req);
  setTraceHeaders(res, traceId);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    log('error', { traceId, where: 'input', msg: 'method_not_allowed', method: req.method });
    return res.status(405).json({ error: 'method_not_allowed', traceId });
  }

  // 必須ENV
  const ENDPOINT = process.env.GAS_ENDPOINT;
  const API_TOKEN = process.env.API_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.SUPABASE_ANON;
  const GAS_ENV = process.env.GAS_ENV || 'prod';
  const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  const miss = [];
  if (!ENDPOINT) miss.push('GAS_ENDPOINT');
  if (!API_TOKEN) miss.push('API_TOKEN');
  if (!SUPABASE_URL) miss.push('SUPABASE_URL');
  if (!SUPABASE_ANON) miss.push('SUPABASE_ANON');
  if (miss.length) {
    log('error', { traceId, where: 'cfg', msg: 'missing_env', missing: miss });
    return res.status(502).json({ error: 'missing_env', missing: miss, traceId });
  }

  // Bearer必須（Supabaseセッション）
  const authz = String(req.headers?.authorization || '');
  if (!/^Bearer\s+.+/i.test(authz)) {
    log('error', { traceId, where: 'auth', msg: 'missing_bearer' });
    return res.status(401).json({ error: 'missing_bearer', traceId });
  }
  const accessToken = authz.replace(/^Bearer\s+/i, '');

  // トークン検証＆メールドメイン制限
  let userEmail = '', userDomain = '';
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.email) {
      log('error', { traceId, where: 'auth', msg: 'token_verify_failed' });
      return res.status(401).json({ error: 'unauthorized', traceId });
    }
    userEmail = String(data.user.email).toLowerCase();
    userDomain = userEmail.split('@')[1] || '';

    if (ALLOWED_EMAIL_DOMAINS.length) {
      const ok = ALLOWED_EMAIL_DOMAINS.some((domRaw) => {
        const dom = String(domRaw).toLowerCase();
        return userDomain === dom || userEmail.endsWith(`@${dom}`);
      });
      if (!ok) {
        log('error', { traceId, where: 'auth', msg: 'forbidden_domain', domain: userDomain });
        return res.status(403).json({ error: 'forbidden_domain', traceId });
      }
    }
  } catch (e) {
    log('error', { traceId, where: 'auth', msg: 'supabase_error', err: String(e) });
    return res.status(500).json({ error: 'auth_failed', traceId });
  }

  // 入力（JSON）
  const body = parseBody(req);
  const action = body?.action;
  const payload = body?.payload ?? {};
  if (!action || typeof action !== 'string') {
    return badRequest(res, traceId, 'missing_action');
  }

  // アクション/ペイロード検証
  const validator = ACTION_VALIDATORS[action];
  if (!validator) return badRequest(res, traceId, 'invalid_action', { action });

  try {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    if (str && str.length > MAX_PAYLOAD_BYTES) {
      return payloadTooLarge(res, traceId, str.length);
    }
  } catch {
    return badRequest(res, traceId, 'invalid_payload_nonserializable');
  }

  let valid = false;
  try { valid = !!validator(payload); } catch { valid = false; }
  if (!valid) return badRequest(res, traceId, 'invalid_payload_shape', { action });

  // テナント選択（管理者UI向けヘッダも受ける）
  const headerTenantId = typeof req.headers?.['x-tenant-id'] === 'string' ? req.headers['x-tenant-id'] : '';

  // テナント解決（見つからなければ従来ENVにフォールバック）
  const tenant = await resolveTenant({ userDomain, headerTenantId, traceId });
  const TARGET_ENDPOINT = tenant?.gas_endpoint || ENDPOINT;
  const TARGET_TOKEN    = tenant?.gas_token    || API_TOKEN;

  // GASへ中継
  try {
    log('info', {
      traceId,
      where: 'forward',
      action,
      tenantId: tenant?.id || headerTenantId || null,
      userDomain,
      env: GAS_ENV
    });

    const params = new URLSearchParams();
    params.set('action', String(action));
    params.set('token', TARGET_TOKEN); // ← テナントで差し替え
    params.set('env', GAS_ENV);
    params.set('traceId', traceId);    // GAS 側でログ相関できるよう付与
    if (tenant?.id) params.set('tenantId', tenant.id);
    else if (headerTenantId) params.set('tenantId', headerTenantId);
    params.set('payload', typeof payload === 'string' ? payload : JSON.stringify(payload));

    const r = await fetch(TARGET_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const text = await r.text();
    const ct = r.headers.get('content-type') || 'text/plain; charset=utf-8';

    // GASが {ok:false,error} を返してきたらHTTPへ昇格
    let maybeJson;
    if (ct.includes('application/json')) {
      try { maybeJson = JSON.parse(text); } catch { /* noop */ }
    }

    let outStatus = r.status;
    let outBody = text;
    let outCT = ct;

    if (maybeJson && typeof maybeJson === 'object' && !Array.isArray(maybeJson)) {
      if (maybeJson.ok === false && maybeJson.error) {
        const map = { unauthorized: 401, forbidden_domain: 403, bad_request: 400 };
        outStatus = map[maybeJson.error] ?? 502;
        outBody = JSON.stringify({ error: maybeJson.error, traceId });
        outCT = 'application/json; charset=utf-8';
      }
    }

    log('info', { traceId, where: 'forward_result', status: outStatus, duration_ms: Date.now() - t0 });
    res.setHeader('Content-Type', outCT);
    setTraceHeaders(res, traceId); // 念押し
    return res.status(outStatus).send(outBody);
  } catch (e) {
    log('error', {
      traceId,
      where: 'forward_catch',
      msg: 'fetch_to_gas_failed',
      err: String(e),
      duration_ms: Date.now() - t0
    });
    setTraceHeaders(res, traceId); // 念押し
    return res.status(502).json({ error: 'bad_gateway', traceId });
  }
}
