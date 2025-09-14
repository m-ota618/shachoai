import React from 'react';

type Props = {
  tabs: string[];
  value: number;
  onChange: (idx: number) => void;
  children: React.ReactNode;
};

export default function Tabs({ tabs, value, onChange, children }: Props) {
  const panels = React.Children.toArray(children);
  return (
    <div className="tabs">
      <div className="tablist" role="tablist" aria-label="drawer tabs">
        {tabs.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={value === i}
            className={`tabchip ${value === i ? 'active' : ''}`}
            onClick={() => onChange(i)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel">
        {panels[value]}
      </div>
    </div>
  );
}
