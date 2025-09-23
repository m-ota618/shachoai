// supabase/functions/auth-hooks-before-signup/index.ts
// Before sign up Hook: org_domains を参照してドメイン許可判定だけ行う。
// 許可: 200（Authがユーザー作成＆メール送信を継続）
// 不許可: 403（ユーザーは作成されない／メールも送られない）

import { createClient } from "npm:@supabase/supabase-js@2";

const supaAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,             // ← Secrets
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // ← Secrets
);

const norm = (s: string) => (s || "").trim().toLowerCase();
const matchDomain = (cand: string, base: string, allowSub: boolean) =>
  !!cand && !!base && (cand === base || (allowSub && cand.endsWith("." + base)));

const DEBUG = (Deno.env.get("DEBUG_SIGNUP_HOOK") || "").toLowerCase() === "true";

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const email = norm(body?.email);
    const d = norm(email.split("@")[1] || "");
    if (!email || !d) {
      if (DEBUG) console.error("[before-signup] invalid_email:", body);
      return new Response(JSON.stringify({ error: "invalid_email" }), { status: 400 });
    }

    // ★ org_domains を直接参照（必要列: domain, allow_subdomains）
    //   列名が異なる場合は select を合わせてください（例: allow_subdomain → allow_subdomains にエイリアス）
    const { data, error } = await supaAdmin
      .from("org_domains")
      .select("domain, allow_subdomains")
      .returns<{ domain: string; allow_subdomains: boolean }[]>();

    if (error) {
      if (DEBUG) console.error("[before-signup] select org_domains error:", error);
      return new Response(JSON.stringify({ error: "server_error" }), { status: 500 });
    }

    const ok = (data ?? []).some((r) => matchDomain(d, norm(r.domain), !!r.allow_subdomains));
    if (!ok) {
      if (DEBUG) console.warn("[before-signup] forbidden_domain:", { email, domain: d });
      return new Response(JSON.stringify({ error: "forbidden_domain" }), { status: 403 });
    }

    // 許可：200で通す（必要なら user_metadata を返す実装に拡張可）
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    if (DEBUG) console.error("[before-signup] unexpected error:", e);
    return new Response(JSON.stringify({ error: "server_error" }), { status: 500 });
  }
});
