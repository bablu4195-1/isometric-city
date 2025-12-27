'use client';

import React, { useEffect, useState } from 'react';
import { X, Lightbulb, SkipForward, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { T, useGT, useMessages } from 'gt-next';

export interface TipToastProps {
  message: string;
  isVisible: boolean;
  onContinue: () => void;
  onSkipAll: () => void;
}

export function TipToast({ message, isVisible, onContinue, onSkipAll }: TipToastProps) {
  const gt = useGT();
  const m = useMessages();
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      // Small delay to trigger animation
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for exit animation before unmounting
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto',
        'transition-all duration-300 ease-out',
        isAnimating 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-4'
      )}
    >
      <div className="relative bg-card border border-sidebar-border rounded-sm shadow-lg overflow-hidden max-w-md">
        {/* Top accent border */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent" />
        
        {/* Content */}
        <div className="p-4 flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-10 h-10 rounded-sm bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-primary" />
          </div>
          
          {/* Message */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-relaxed">
              {m(message)}
            </p>
          </div>
          
          {/* Close button */}
          <button
            onClick={onContinue}
            className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={gt('Dismiss tip')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Action buttons */}
        <div className="px-4 pb-4 flex items-center gap-2 justify-end">
          <T>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkipAll}
              className="text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip All Tips
            </Button>
          </T>
          <T>
            <Button
              variant="default"
              size="sm"
              onClick={onContinue}
              className="text-xs gap-1"
            >
              Continue
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </T>
        </div>
        
        {/* Bottom decorative corners */}
        <div className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-primary/30" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-r border-b border-primary/30" />
      </div>
    </div>
  );
}
