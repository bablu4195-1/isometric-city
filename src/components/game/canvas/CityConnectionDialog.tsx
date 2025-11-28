'use client';

import React, { memo } from 'react';

import { AdjacentCity } from '@/types/game';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CityConnectionDialogProps {
  dialog: { direction: 'north' | 'south' | 'east' | 'west' } | null;
  adjacentCities: AdjacentCity[];
  onClose: () => void;
  onConnect: (cityId: string) => void;
}

export const CityConnectionDialog = memo(function CityConnectionDialog({
  dialog,
  adjacentCities,
  onClose,
  onConnect,
}: CityConnectionDialogProps) {
  if (!dialog) return null;

  const city = adjacentCities.find(
    c => c.direction === dialog.direction && c.discovered && !c.connected
  );
  if (!city) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>City Discovered!</DialogTitle>
          <DialogDescription>
            Your road has reached the {dialog.direction} border! You&apos;ve discovered {city.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-4">
          <div className="text-sm text-muted-foreground">
            Connecting to {city.name} will establish a trade route, providing:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>$5,000 one-time bonus</li>
              <li>$200/month additional income</li>
            </ul>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Maybe Later
            </Button>
            <Button onClick={() => onConnect(city.id)}>Connect to {city.name}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
