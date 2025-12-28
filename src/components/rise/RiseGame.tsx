'use client';

import React, { useMemo } from 'react';
import { useRiseGame } from '@/context/RiseGameContext';
import { ResourceBar } from './ResourceBar';
import { RiseCanvas } from './RiseCanvas';
import { AGE_CONFIGS } from '@/games/rise/constants';

const SPEED_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: 'Pause',
  1: '1x',
  2: '2x',
  3: '4x',
};

export default function RiseGame() {
  const { state, setSpeed, spawnCitizen, ageUp } = useRiseGame();
  const player = state.players.find(p => p.id === state.localPlayerId);
  const ageLabel = useMemo(() => {
    if (!player) return '';
    const cfg = AGE_CONFIGS.find(a => a.id === player.age);
    return cfg?.label ?? player.age;
  }, [player]);

  if (!player) return null;

  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-800 shadow">
            <div className="text-xs uppercase text-slate-400">Age</div>
            <div className="font-semibold">{ageLabel}</div>
          </div>
          <ResourceBar resources={player.resources} />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-sm font-semibold"
            onClick={spawnCitizen}
          >
            Spawn Citizen
          </button>
          <button
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-md text-sm font-semibold"
            onClick={ageUp}
          >
            Age Up
          </button>
          <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-1">
            {([0, 1, 2, 3] as const).map(s => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 rounded-md text-xs font-semibold ${
                  state.speed === s ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {SPEED_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[720px] rounded-lg overflow-hidden border border-slate-800 bg-slate-900/60">
        <RiseCanvas />
      </div>

      <div className="flex gap-2 text-xs text-slate-400">
        <span>Left drag: select units. Right click: move / gather if on resource node. Spawn citizens from city center.</span>
      </div>
    </div>
  );
}
