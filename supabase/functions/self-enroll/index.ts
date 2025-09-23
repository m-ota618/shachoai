// supabase/functions/self-enroll/index.ts
// 目的: メールドメインが許可されているかだけを判定して返す
//      ※ここではユーザー作成・招待メール送信は一切しない（= パスワード入力後の signUp で初めて作成）

import { createClient } from "npm:@supabase/supabase-js@2";

// ===== Config =====
const supaAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// CORS 許可オリジン（カンマ区切り）
const CORS = (Deno.env.get("CORS_ALLOW_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && (CORS.length === 0 || CORS.includes(origin))) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "Content-Type, Authorization, apikey";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return h;
}

const normalize = (s: string) => (s || "").trim().toLowerCase();

function domainMatches(candidate: string, base: string, allowSub: boolean) {
  if (!candidate || !base) return false;
  return candidate === base || (allowSub && candidate.endsWith("." + base));
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const baseHeaders = { "content-type": "application/json", ...corsHeaders(origin) };

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: baseHeaders,
    });
  }

  try {
    const { email } = await req.json().catch(() => ({}));
    const e = normalize(email);
    const d = normalize((e.split("@")[1] || ""));
    if (!e || !d) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    // org_domains から許可ドメインを取得
    const { data: domains, error: domErr } = await supaAdmin
      .from("org_domains")
      .select("org_id, domain, allow_subdomains");

    if (domErr) {
      return new Response(JSON.stringify({ error: "server_error", detail: domErr.message }), {
        status: 500,
        headers: baseHeaders,
      });
    }

    let orgId: string | null = null;
    for (const row of domains ?? []) {
      const base = normalize((row as any).domain);
      const allow = !!(row as any).allow_subdomains;
      if (domainMatches(d, base, allow)) {
        orgId = (row as any).org_id;
        break;
      }
    }

    if (!orgId) {
      return new Response(JSON.stringify({ error: "forbidden_domain" }), {
        status: 403,
        headers: baseHeaders,
      });
    }

    // 許可OK（ここでは作成・招待はしない）
    return new Response(JSON.stringify({ ok: true, allowed: true, org_id: orgId }), {
      status: 200,
      headers: baseHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "server_error", detail: String((err as any)?.message ?? err) }),
      { status: 500, headers: baseHeaders }
    );
  }
});
