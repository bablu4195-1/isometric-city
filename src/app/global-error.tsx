'use client';

import { useEffect } from 'react';
import { GameProvider } from '@/context/GameContext';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <GameProvider>
          <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Something went wrong</p>
              <p className="text-lg font-semibold text-foreground">IsoCity hit a snag</p>
            </div>
            {error?.message && (
              <pre className="bg-card/70 border border-border/60 rounded-md px-4 py-3 text-left text-xs text-muted-foreground max-w-lg whitespace-pre-wrap">
                {error.message}
              </pre>
            )}
            <Button onClick={() => reset()} variant="default" className="px-6">
              Reload city
            </Button>
          </div>
        </GameProvider>
      </body>
    </html>
  );
}
