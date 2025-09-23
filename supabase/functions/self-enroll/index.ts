// supabase/functions/self-enroll/index.ts
// 目的: 入力メールのドメインが許可されていれば OK を返す。
// checkOnly が true の場合はメールを送らず、単に判定のみ。
// checkOnly がない場合は従来どおり招待／マジックリンク送信を実行。
// 必要: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 任意: CORS_ALLOW_ORIGINS, INVITE_REDIRECT_TO, AUTH_REDIRECT_TO, SITE_URL

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

// リダイレクト先
const INVITE_REDIRECT_TO =
  Deno.env.get("INVITE_REDIRECT_TO") ||
  `${Deno.env.get("SITE_URL")}/set-password`;

const AUTH_REDIRECT_TO =
  Deno.env.get("AUTH_REDIRECT_TO") ||
  `${Deno.env.get("SITE_URL")}/auth`;

// ★ 反映（reflect）型のCORSヘッダ: SDKが付ける x-client-info 等を自動許可
function corsHeaders(origin: string | null, req: Request) {
  const allow = origin && (CORS.length === 0 || CORS.includes(origin));
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers") || "";
  const h: Record<string, string> = {
    Vary: "Origin, Access-Control-Request-Headers",
  };
  if (allow) {
    h["Access-Control-Allow-Origin"] = origin!;
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    h["Access-Control-Allow-Headers"] =
      requestedHeaders || "authorization, apikey, content-type, x-client-info";
  }
  return h;
}

const normalize = (s: string) => (s || "").trim().toLowerCase();
const domainMatches = (cand: string, base: string, allowSub: boolean) =>
  !!cand && !!base && (cand === base || (allowSub && cand.endsWith("." + base)));

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const baseHeaders = { "content-type": "application/json", ...corsHeaders(origin, req) };

  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: baseHeaders });

  try {
    const { email, checkOnly } = await req.json().catch(() => ({}));
    const e = normalize(email);
    const d = normalize((e.split("@")[1] || ""));
    if (!e || !d) {
      return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400, headers: baseHeaders });
    }

    // 1) 許可ドメインの確認（※実テーブル名に合わせる）
    const { data: domains, error: domErr } = await supaAdmin
      .from("signup_allowed_domains")
      .select("org_id, domain, allow_subdomains");
    if (domErr) {
      return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
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
      return new Response(JSON.stringify({ error: "forbidden_domain" }), { status: 403, headers: baseHeaders });
    }

    // 2) checkOnly=true の場合はここで終了（フロントがメール送信する）
    if (checkOnly) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: baseHeaders });
    }

    // 3) 登録済みか判定 → 未登録: 招待 / 登録済: マジックリンク
    const { data: found, error: getErr } = await supaAdmin.auth.admin.getUserByEmail(e);
    if (getErr && getErr.message && !/User not found/i.test(getErr.message)) {
      return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
    }
    const exists = !!found?.user;

    if (!exists) {
      const inviteRes = await supaAdmin.auth.admin.inviteUserByEmail(e, {
        redirectTo: INVITE_REDIRECT_TO,
        data: { default_tenant_id: orgId, onboarded: false },
      });
      if (inviteRes.error) {
        return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
      }

      const uid = inviteRes.data?.user?.id;
      if (uid) {
        await supaAdmin.from("org_memberships").upsert(
          { org_id: orgId, user_id: uid, role: "member" },
          { onConflict: "org_id,user_id", ignoreDuplicates: true }
        );
        const appMeta = (inviteRes.data.user.app_metadata ?? {}) as Record<string, unknown>;
        if (!appMeta["default_tenant_id"]) {
          await supaAdmin.auth.admin.updateUserById(uid, {
            app_metadata: { ...appMeta, default_tenant_id: orgId },
          });
        }
      }
    } else {
      const existing = found.user!;
      const gen = await supaAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: e,
        options: { redirectTo: AUTH_REDIRECT_TO },
      });
      if (gen.error) {
        return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
      }

      await supaAdmin.from("org_memberships").upsert(
        { org_id: orgId, user_id: existing.id, role: "member" },
        { onConflict: "org_id,user_id", ignoreDuplicates: true }
      );
      const appMeta = (existing.app_metadata ?? {}) as Record<string, unknown>;
      if (!appMeta["default_tenant_id"]) {
        await supaAdmin.auth.admin.updateUserById(existing.id, {
          app_metadata: { ...appMeta, default_tenant_id: orgId },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: baseHeaders });
  } catch {
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
  }
});
