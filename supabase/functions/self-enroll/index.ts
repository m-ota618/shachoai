/// <reference lib="deno.ns" />
/// <reference lib="deno.window" />
/// <reference lib="dom" />

// supabase/functions/self-enroll/index.ts
// Deno runtime (Edge Functions)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===== Config =====
const supaAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const REDIRECT = Deno.env.get("MAGICLINK_REDIRECT_TO")!; // 例: https://your.app/app
const CORS = (Deno.env.get("CORS_ALLOW_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && CORS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return h;
}

const normalize = (s: string) => (s || "").trim().toLowerCase();

function domainMatches(candidate: string, base: string, allowSub: boolean) {
  if (!candidate || !base) return false;
  return candidate === base || (allowSub && candidate.endsWith("." + base));
}

// 既存ユーザー探索（Admin.listUsers をページング）
async function findUserByEmail(email: string) {
  const perPage = 100;
  for (let page = 1; page <= 10; page++) { // 最大1000件まで探索（必要に応じて調整）
    const res = await supaAdmin.auth.admin.listUsers({ page, perPage });
    if (res.error) throw res.error;
    const found = (res.data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === email
    );
    if (found) return found;
    if (!res.data || res.data.users.length < perPage) break; // 末尾
  }
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const baseHeaders = { "content-type": "application/json", ...corsHeaders(origin) };

  // CORS preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: baseHeaders });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: baseHeaders,
    });

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

    // 1) 許可ドメインから org を解決（件数が多いならRPC化も可）
    const { data: domains, error: domErr } = await supaAdmin
      .from("org_domains")
      .select("org_id, domain, allow_subdomains");
    if (domErr) throw domErr;

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

    // 2) ユーザー作成 or 既存処理
    let user: any = null;

    // (A) まず作成を試す
    const created = await supaAdmin.auth.admin.createUser({
      email: e,
      email_confirm: false, // マジックリンクで確認
      app_metadata: { default_tenant_id: orgId },
      user_metadata: { onboarded: false },
    });

    // (B) 作成成功 → user確定
    if (created.data?.user && !created.error) {
      user = created.data.user;

      // 所属を付与
      const { error: memErr } = await supaAdmin
        .from("org_memberships")
        .insert({ org_id: orgId, user_id: user.id, role: "member" });
      if (memErr) {
        // 失敗時の暫定ロールバック（必要に応じて調整）
        await supaAdmin.auth.admin.updateUserById(user.id, { banned_until: "2999-01-01T00:00:00Z" }).catch(() => {});
        return new Response(JSON.stringify({ error: "membership_failed", detail: memErr.message }), {
          status: 500,
          headers: baseHeaders,
        });
      }

      // マジックリンク発行 & 送信
      const linkRes = await supaAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: e,
        options: { redirectTo: REDIRECT },
      });
      if (linkRes.error) {
        return new Response(JSON.stringify({ error: "magiclink_failed", detail: linkRes.error.message }), {
          status: 500,
          headers: baseHeaders,
        });
      }

      return new Response(JSON.stringify({ ok: true, created: true, invited: true }), {
        status: 200,
        headers: baseHeaders,
      });
    }

    // (C) 作成エラー：既存の可能性を確認（listUsersで探索）
    const msg = created.error?.message?.toLowerCase() ?? "";
    if (!user && (msg.includes("already") || msg.includes("registered") || msg.includes("exists"))) {
      user = await findUserByEmail(e);
    }

    // (D) 既存ユーザーが見つかった場合：membershipとapp_metadataを補正
    if (user) {
      const uid = user.id;

      await supaAdmin
        .from("org_memberships")
        .upsert({ org_id: orgId, user_id: uid, role: "member" }, { onConflict: "org_id,user_id", ignoreDuplicates: true });

      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
      if (!appMeta["default_tenant_id"]) {
        await supaAdmin.auth.admin.updateUserById(uid, {
          app_metadata: { ...appMeta, default_tenant_id: orgId },
        });
      }

      // 既存ユーザーにはメール送信は省略（必要なら generateLink をここでも呼ぶ運用に変更可）
      return new Response(JSON.stringify({ ok: true, already_exists: true }), {
        status: 200,
        headers: baseHeaders,
      });
    }

    // (E) 上記以外はエラー応答
    return new Response(JSON.stringify({ error: "create_failed", detail: created.error?.message ?? "unknown" }), {
      status: 500,
      headers: baseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "server_error", detail: String((err as any)?.message ?? err) }), {
      status: 500,
      headers: baseHeaders,
    });
  }
});
