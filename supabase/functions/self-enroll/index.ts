// supabase/functions/self-enroll/index.ts
// 目的: 許可ドメインを確認し、OKなら Supabase の「招待メール」を送る
// 招待リンクから来たユーザーは /set-password で初回パスワードを設定できる

import { createClient } from "npm:@supabase/supabase-js@2";

// ===== Admin Client =====
const supaAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// CORS 許可オリジン（カンマ区切り）
const CORS = (Deno.env.get("CORS_ALLOW_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// 招待リンクのリダイレクト先（完全一致で Auth の Redirect URLs に登録しておく）
const REDIRECT_TO = Deno.env.get("INVITE_REDIRECT_TO") || `${Deno.env.get("SITE_URL")}/set-password`;

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
const domainMatches = (cand: string, base: string, allowSub: boolean) =>
  !!cand && !!base && (cand === base || (allowSub && cand.endsWith("." + base)));

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const baseHeaders = { "content-type": "application/json", ...corsHeaders(origin) };

  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: baseHeaders });

  try {
    const { email } = await req.json().catch(() => ({}));
    const e = normalize(email);
    const d = normalize((e.split("@")[1] || ""));
    if (!e || !d) {
      return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: baseHeaders });
    }

    // 1) 許可ドメインの確認
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
      if (domainMatches(d, base, allow)) { orgId = (row as any).org_id; break; }
    }
    if (!orgId) {
      return new Response(JSON.stringify({ error: "forbidden_domain" }), { status: 403, headers: baseHeaders });
    }

    // 2) 招待メール送信（※この時点でユーザーは「招待状態」で作成される）
    const inviteRes = await supaAdmin.auth.admin.inviteUserByEmail(e, {
      redirectTo: REDIRECT_TO,                            // ← /set-password に戻す
      data: { default_tenant_id: orgId, onboarded: false } // ← 任意の user_metadata
    });
    if (inviteRes.error) {
      return new Response(JSON.stringify({ error: "invite_failed", detail: inviteRes.error.message }), {
        status: 500,
        headers: baseHeaders,
      });
    }

    // 3) 所属付与（既に存在していた場合にも冪等に）
    const uid = inviteRes.data?.user?.id;
    if (uid) {
      await supaAdmin
        .from("org_memberships")
        .upsert({ org_id: orgId, user_id: uid, role: "member" }, { onConflict: "org_id,user_id", ignoreDuplicates: true });
      // app_metadata の既定テナント補正（あれば維持）
      const appMeta = (inviteRes.data.user.app_metadata ?? {}) as Record<string, unknown>;
      if (!appMeta["default_tenant_id"]) {
        await supaAdmin.auth.admin.updateUserById(uid, { app_metadata: { ...appMeta, default_tenant_id: orgId } });
      }
    }

    return new Response(JSON.stringify({ ok: true, invited: true }), { status: 200, headers: baseHeaders });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "server_error", detail: String((err as any)?.message ?? err) }),
      { status: 500, headers: baseHeaders }
    );
  }
});
