'use client';

import React from 'react';

const items = [
  { label: 'Forest / Wood', color: '#22c55e' },
  { label: 'Mine / Metal', color: '#f59e0b' },
  { label: 'Oil', color: '#0f172a' },
  { label: 'Fertile / Farm', color: '#84cc16' },
  { label: 'Rare / Wealth', color: '#c084fc' },
  { label: 'Friendly Units', color: '#a855f7' },
  { label: 'Enemy Units', color: '#facc15' },
  { label: 'Friendly Buildings', color: '#22d3ee' },
  { label: 'Enemy Buildings', color: '#f97316' },
  { label: 'Friendly Territory', color: 'rgba(56,189,248,0.35)' },
  { label: 'Enemy Territory', color: 'rgba(249,115,22,0.35)' },
  { label: 'Alert Ping', color: '#ef4444' },
];

export function Legend() {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 space-y-2">
      <div className="text-[10px] uppercase text-slate-500 font-semibold">Legend</div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-sm border border-slate-700" style={{ backgroundColor: item.color }} />
            <span className="leading-snug">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
