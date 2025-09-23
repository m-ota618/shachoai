// supabase/functions/self-enroll/index.ts
// 目的: 入力メールのドメインが許可されていれば、
//       - 未登録: 招待メール（/set-passwordへ）を送信
//       - 登録済: サインイン用のマジックリンク（/authへ）を送信
//     両者の「違い」はレスポンスに出さない（列挙対策）。
//     さらに、org_memberships への所属付与は冪等に実施。
// 必要な環境変数: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 任意の環境変数: CORS_ALLOW_ORIGINS (カンマ区切り), INVITE_REDIRECT_TO, AUTH_REDIRECT_TO, SITE_URL

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

// 招待リンクのリダイレクト先（/set-password を想定）
const INVITE_REDIRECT_TO =
  Deno.env.get("INVITE_REDIRECT_TO") ||
  `${Deno.env.get("SITE_URL")}/set-password`;

// 既存ユーザー向けマジックリンクのリダイレクト先（/auth を想定）
const AUTH_REDIRECT_TO =
  Deno.env.get("AUTH_REDIRECT_TO") ||
  `${Deno.env.get("SITE_URL")}/auth`;

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

    // 1) 許可ドメインの確認（org_domains: domain, allow_subdomains, org_id）
    const { data: domains, error: domErr } = await supaAdmin
      .from("org_domains")
      .select("org_id, domain, allow_subdomains");
    if (domErr) {
      return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
    }

    let orgId: string | null = null;
    for (const row of domains ?? []) {
      const base = normalize((row as any).domain);
      const allow = !!(row as any).allow_subdomains;
      if (domainMatches(d, base, allow)) { orgId = (row as any).org_id; break; }
    }
    if (!orgId) {
      // 許可外は 403 を返す（UIでは「登録できません」の固定文言にする）
      return new Response(JSON.stringify({ error: "forbidden_domain" }), { status: 403, headers: baseHeaders });
    }

    // 2) 登録済みかは UI に出さないが、内部では分岐して適切なメールを送る
    //    - 未登録: inviteUserByEmail
    //    - 登録済: admin.generateLink('magiclink')
    //
    //    listUsers でメール一致検索（外部に漏らさない前提の内部利用）
    const { data: usersList, error: listErr } = await supaAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
      email: e,
    });
    if (listErr) {
      return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
    }

    const exists = (usersList?.users?.length ?? 0) > 0;

    if (!exists) {
      // ---- 未登録: 招待メール（/set-password） ----
      const inviteRes = await supaAdmin.auth.admin.inviteUserByEmail(e, {
        redirectTo: INVITE_REDIRECT_TO,
        data: { default_tenant_id: orgId, onboarded: false }, // 任意 metadata
      });

      if (inviteRes.error) {
        // 「既に存在」等の詳細は外に出さない
        return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
      }

      const uid = inviteRes.data?.user?.id;
      if (uid) {
        // memberships を冪等 upsert
        await supaAdmin
          .from("org_memberships")
          .upsert(
            { org_id: orgId, user_id: uid, role: "member" },
            { onConflict: "org_id,user_id", ignoreDuplicates: true }
          );

        // 既定テナントの app_metadata 付与（なければ）
        const appMeta = (inviteRes.data.user.app_metadata ?? {}) as Record<string, unknown>;
        if (!appMeta["default_tenant_id"]) {
          await supaAdmin.auth.admin.updateUserById(uid, {
            app_metadata: { ...appMeta, default_tenant_id: orgId },
          });
        }
      }
    } else {
      // ---- 登録済み: マジックリンク（/auth） ----
      const existing = usersList!.users![0];
      // generateLink を使ってサインイン用のメールを送付
      const gen = await supaAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: e,
        options: { redirectTo: AUTH_REDIRECT_TO },
      });
      if (gen.error) {
        return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
      }

      // 所属は冪等に確保（既存ユーザーでも org_memberships を保証）
      await supaAdmin
        .from("org_memberships")
        .upsert(
          { org_id: orgId, user_id: existing.id, role: "member" },
          { onConflict: "org_id,user_id", ignoreDuplicates: true }
        );

      // 既定テナントの app_metadata を補正（なければ）
      const appMeta = (existing.app_metadata ?? {}) as Record<string, unknown>;
      if (!appMeta["default_tenant_id"]) {
        await supaAdmin.auth.admin.updateUserById(existing.id, {
          app_metadata: { ...appMeta, default_tenant_id: orgId },
        });
      }
    }

    // 3) UI には登録有無を出さないため、成功時は常に同じレスポンス
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: baseHeaders });
  } catch {
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500, headers: baseHeaders });
  }
});
