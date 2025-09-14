import React, { createContext, useContext, useMemo, useState } from 'react';

export type ToastItem = { id: number; text: string; kind?: 'info'|'error'|'success' };
type Ctx = { push: (t: Omit<ToastItem, 'id'>) => void };
const ToastCtx = createContext<Ctx | null>(null);
let _id = 1;

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('ToastHost not mounted');
  return ctx.push;
}

export default function ToastHost({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const api = useMemo<Ctx>(() => ({
    push: (t) => {
      const id = _id++;
      setItems((ls) => [...ls, { id, ...t }]);
      setTimeout(() => setItems((ls) => ls.filter((x) => x.id !== id)), 3000);
    },
  }), []);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-wrap" aria-live="polite" aria-atomic="true">
        {items.map((it) => (
          <div key={it.id} className={`toast ${it.kind || 'info'}`}>{it.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
