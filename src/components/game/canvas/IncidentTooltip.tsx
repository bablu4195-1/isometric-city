'use client';

import React, { memo } from 'react';

import { FireIcon, SafetyIcon } from '@/components/ui/Icons';

interface IncidentTooltipProps {
  hoveredIncident: {
    x: number;
    y: number;
    type: 'fire' | 'crime';
    crimeType?: 'robbery' | 'burglary' | 'disturbance' | 'traffic';
    screenX: number;
    screenY: number;
  } | null;
}

export const IncidentTooltip = memo(function IncidentTooltip({ hoveredIncident }: IncidentTooltipProps) {
  if (!hoveredIncident) return null;

  const tooltipWidth = 200;
  const padding = 16;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const wouldOverflowRight = hoveredIncident.screenX + padding + tooltipWidth > viewportWidth - padding;
  const left = wouldOverflowRight
    ? hoveredIncident.screenX - tooltipWidth - padding
    : hoveredIncident.screenX + padding;

  const title =
    hoveredIncident.type === 'fire'
      ? 'Fire'
      : hoveredIncident.crimeType === 'robbery'
      ? 'Robbery'
      : hoveredIncident.crimeType === 'burglary'
      ? 'Burglary'
      : hoveredIncident.crimeType === 'disturbance'
      ? 'Disturbance'
      : 'Traffic Incident';

  const description =
    hoveredIncident.type === 'fire'
      ? 'Building on fire. Fire trucks responding.'
      : hoveredIncident.crimeType === 'robbery'
      ? 'Armed robbery in progress.'
      : hoveredIncident.crimeType === 'burglary'
      ? 'Break-in detected.'
      : hoveredIncident.crimeType === 'disturbance'
      ? 'Public disturbance reported.'
      : 'Traffic violation in progress.';

  return (
    <div className="fixed pointer-events-none z-[100]" style={{ left, top: hoveredIncident.screenY - 8 }}>
      <div className="bg-sidebar border border-sidebar-border rounded-md shadow-lg px-3 py-2 w-[200px]">
        <div className="flex items-center gap-2 mb-1">
          {hoveredIncident.type === 'fire' ? (
            <FireIcon size={14} className="text-red-400" />
          ) : (
            <SafetyIcon size={14} className="text-blue-400" />
          )}
          <span className="text-xs font-semibold text-sidebar-foreground">{title}</span>
        </div>

        <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>

        <div className="mt-1.5 pt-1.5 border-t border-sidebar-border/50 text-[10px] text-muted-foreground/60 font-mono">
          ({hoveredIncident.x}, {hoveredIncident.y})
        </div>
      </div>
    </div>
  );
});
