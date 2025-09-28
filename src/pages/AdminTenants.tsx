import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type OrgRow = { id: string; name: string; slug: string };

export default function AdminTenants() {
  const [list, setList] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  const load = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_accessible_orgs");
      if (error) throw error;
      setList((data as OrgRow[]) ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "読み込みに失敗しました。");
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const go = (slug: string) => nav(`/${slug}/app`, { replace: true });

  return (
    <>
      {/* Loginと同じロゴヘッダー */}
      <header className="app-header" role="banner">
        <img src="/planter-lockup.svg" alt="Planter" className="brand-lockup" />
        <div className="app-header-divider" />
      </header>

      <main className="auth-center">
        <section className="auth-card" aria-labelledby="tenantTitle">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 id="tenantTitle" className="auth-card-title">テナントを選択</h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={load}
              aria-label="再読み込み"
            >
              再読み込み
            </button>
          </div>

          {loading && (
            <div className="skeleton" style={{ marginTop: 10 }}>読み込み中...</div>
          )}

          {err && !loading && (
            <div role="alert" className="auth-alert err" style={{ marginTop: 10 }}>
              {err}
            </div>
          )}

          {!loading && !err && list.length === 0 && (
            <div className="empty" style={{ marginTop: 6 }}>
              表示できるテナントがありません。
              <div className="help" style={{ marginTop: 6 }}>
                管理者のはずなのに表示されない場合は
                <code style={{ margin: "0 4px" }}>get_is_admin()</code> /
                <code style={{ margin: "0 4px" }}>get_accessible_orgs()</code> /
                <code style={{ margin: "0 4px" }}>ensure_membership_for_current_user()</code>
                の実装と権限をご確認ください。
              </div>
            </div>
          )}

          {!loading && !err && list.length > 0 && (
            <ul
              className="cards"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
                marginTop: 12,
                listStyle: "none",
                padding: 0
              }}
            >
              {list.map((org) => (
                <li key={org.id}>
                  <div
                    className="card"
                    tabIndex={0}
                    role="button"
                    onClick={() => go(org.slug)}
                    onKeyDown={(e) => { if (e.key === "Enter") go(org.slug); }}
                    aria-label={`${org.name} を開く`}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="q" style={{ marginBottom: 6 }}>{org.name}</div>
                    <div className="meta" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="badge badge-light">/{org.slug}</span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={(e) => { e.stopPropagation(); go(org.slug); }}
                        aria-label={`${org.name} のテナントに入る`}
                      >
                        このテナントに入る
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
