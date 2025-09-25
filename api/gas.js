// api/gas.js  ← Vercel Node 関数（ESM: default export）
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';

/* ==================== constants ==================== */
const MAX_PAYLOAD_BYTES = 256 * 1024; // 256KB（DoS/誤送信対策）
const GAS_ENV = process.env.GAS_ENV || 'prod'; // 任意：GAS側で環境分岐したい場合

/* ==================== action validators ==================== */
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
  res.setHeader('Access-Control-Expose-Headers', 'X-Trace-Id, x-trace-id, X-Build, Content-Type, X-Tenant-Id, X-GAS-Endpoint');

  if (allow.length) {
    if (allow.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}

function setTraceHeaders(res, traceId) {
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

function requestHost(req) {
  return String(
    req.headers?.['x-forwarded-host'] ||
    req.headers?.host ||
    ''
  ).toLowerCase();
}

/* ================ tenant resolver (RPC版) ================ */
/** org_domains→org_settings を参照する公式リゾルバ（未解決時 null） */
async function resolveTenantByDomain({ domainLike, traceId }) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    log('error', { traceId, where: 'tenant', msg: 'missing_supabase_env' });
    return null;
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const { data, error } = await admin.rpc('resolve_tenant', {
      p_domain: String(domainLike || '').toLowerCase(),
    });
    if (error) throw error;
    return data || null; // [{ org_id, gas_endpoint, gas_token }] or null
  } catch (e) {
    log('error', { traceId, where: 'tenant', msg: 'resolve_failed', err: String(e) });
    return null;
  }
}

/* ==================== main ==================== */
export default async function handler(req, res) {
  const t0 = Date.now();
  setCors(req, res);

  const traceId = newTraceId(req);
  setTraceHeaders(res, traceId);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    log('error', { traceId, where: 'input', msg: 'method_not_allowed', method: req.method });
    return res.status(405).json({ error: 'method_not_allowed', traceId });
  }

  // ======== 必須ENV（DB版では Supabase だけ必須）========
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON = process.env.SUPABASE_ANON; // 任意：Bearer検証をするなら必要
  const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

  const miss = [];
  if (!SUPABASE_URL) miss.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE) miss.push('SUPABASE_SERVICE_ROLE');
  if (miss.length) {
    log('error', { traceId, where: 'cfg', msg: 'missing_env', missing: miss });
    return res.status(502).json({ error: 'missing_env', missing: miss, traceId });
  }

  // ======== 認証（任意）========
  // Hostベースでテナント解決するため、Bearerが無くても進行可能。
  // 付与されていれば Supabase で検証し、ログ相関に使う。
  let userEmail = '', userDomainFromToken = '';
  const authz = String(req.headers?.authorization || '');
  if (/^Bearer\s+.+/i.test(authz) && SUPABASE_ANON) {
    const accessToken = authz.replace(/^Bearer\s+/i, '');
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (!error && data?.user?.email) {
        userEmail = String(data.user.email).toLowerCase();
        userDomainFromToken = userEmail.split('@')[1] || '';
      }
    } catch (e) {
      log('error', { traceId, where: 'auth', msg: 'supabase_error', err: String(e) });
      // 続行（Host 解決で処理可能）
    }
  }

  // ======== 入力（JSON）========
  const body = parseBody(req);
  const action = body?.action;
  const payload = body?.payload ?? {};
  if (!action || typeof action !== 'string') {
    return badRequest(res, traceId, 'missing_action');
  }

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

  // ======== テナント解決（Hostベース）========
  const host = requestHost(req);
  const tenantRows = await resolveTenantByDomain({ domainLike: host, traceId });
  const tenant = Array.isArray(tenantRows) && tenantRows.length ? tenantRows[0] : null;

  if (!tenant) {
    log('error', { traceId, where: 'tenant', msg: 'tenant_not_found', host, userDomainFromToken });
    res.setHeader('X-Tenant-Id', '');
    res.setHeader('X-GAS-Endpoint', '');
    return res.status(403).json({ error: 'tenant_not_found',host, traceId });
  }

  const TARGET_ENDPOINT = tenant.gas_endpoint;
  const TARGET_TOKEN = tenant.gas_token;

  // 観測ヘッダ（検証中に便利。運用安定後に削除可）
  res.setHeader('X-Tenant-Id', tenant.org_id || '');
  res.setHeader('X-GAS-Endpoint', TARGET_ENDPOINT || '');

  // ======== GASへ中継（x-www-form-urlencoded）========
  try {
    log('info', {
      traceId,
      where: 'forward',
      action,
      tenantId: tenant?.org_id || null,
      host,
      userEmail,
      env: GAS_ENV
    });

    const params = new URLSearchParams();
    params.set('action', String(action));
    params.set('token', TARGET_TOKEN || ''); // DBの token を使用（将来は Authorization ヘッダに移行可）
    params.set('env', GAS_ENV);
    params.set('traceId', traceId);
    if (tenant?.org_id) params.set('tenantId', tenant.org_id);
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
    setTraceHeaders(res, traceId);
    return res.status(outStatus).send(outBody);
  } catch (e) {
    log('error', {
      traceId,
      where: 'forward_catch',
      msg: 'fetch_to_gas_failed',
      err: String(e),
      duration_ms: Date.now() - t0
    });
    setTraceHeaders(res, traceId);
    return res.status(502).json({ error: 'bad_gateway', traceId });
  }
}
