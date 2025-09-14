import React, { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function Drawer({ open, title = '詳細', subtitle, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && panelRef.current) panelRef.current.focus();
  }, [open]);

  return (
    <>
      <div className={`drawer-backdrop ${open ? 'show' : ''}`} onClick={onClose} aria-hidden />
      <aside
        className={`drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-labelledby="drawerTitle"
        aria-modal="true"
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="drawer-header">
          <div className="drawer-tt">
            <div id="drawerTitle" className="drawer-title">{title}</div>
            {subtitle ? <div className="drawer-subtitle" title={subtitle}>{subtitle}</div> : null}
          </div>
          <button className="icon-btn close dark" aria-label="閉じる" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}
