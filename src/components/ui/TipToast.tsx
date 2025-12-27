'use client';

import React from 'react';
import { Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type TipToastProps = {
  open: boolean;
  title?: string;
  description: string;
  onContinueAction: () => void;
  onSkipAllAction: () => void;
  className?: string;
};

export function TipToast({
  open,
  title = 'Tip',
  description,
  onContinueAction,
  onSkipAllAction,
  className,
}: TipToastProps) {
  return (
    <div
      className={cn(
        'fixed z-[60] px-4',
        'bottom-4 left-0 right-0 md:left-auto md:right-4 md:w-[420px]',
        'pointer-events-none',
        className,
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={cn(
          'pointer-events-auto',
          'mx-auto md:mx-0',
          'rounded-lg border border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75',
          'shadow-lg',
          'transition-all duration-200',
          open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        )}
        role="status"
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">{title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{description}</div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onSkipAllAction}>
                  Skip all
                </Button>
                <Button variant="default" size="sm" onClick={onContinueAction}>
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

