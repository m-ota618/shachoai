import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type OrgRow = { id: string; name: string; slug: string };

export default function AdminTenants() {
  const [list, setList] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_accessible_orgs');
      if (!error) setList((data as OrgRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <main className="p-6">読み込み中…</main>;

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-xl font-bold">テナントを選択</h1>
      <ul className="space-y-2">
        {list.map(org => (
          <li key={org.id}>
            <button
              className="px-4 py-2 rounded bg-black text-white"
              onClick={() => nav(`/${org.slug}/mypage`)}  // ← 行き先は任意
            >
              {org.name}（/{org.slug}）
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
