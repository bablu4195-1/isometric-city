'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { useGame } from '@/context/GameContext';
import { Copy, Check, Users, Loader2 } from 'lucide-react';
import { T, useGT } from 'gt-next';

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareModal({ open, onOpenChange }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [playerName] = useState(() => `Player ${Math.floor(Math.random() * 9999)}`);

  const { roomCode, players, createRoom, connectionState } = useMultiplayer();
  const { state } = useGame();
  const gt = useGT();

  // Create room when modal opens (if not already in a room)
  useEffect(() => {
    if (open && !roomCode && !isCreating) {
      const initRoom = async () => {
        setIsCreating(true);
        try {
          const code = await createRoom(state.cityName, playerName, state);
          // Update URL to show room code
          window.history.replaceState({}, '', `/?room=${code}`);
        } catch (err) {
          console.error('[ShareModal] Failed to create room:', err);
        } finally {
          setIsCreating(false);
        }
      };
      initRoom();
    }
  }, [open, roomCode, isCreating, createRoom, state, playerName]);

  // Reset copied state when modal closes
  useEffect(() => {
    return () => {
      if (!open) {
        setCopied(false);
      }
    };
  }, [open]);

  const handleCopyLink = () => {
    if (!roomCode) return;

    const url = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inviteUrl = roomCode ? `${window.location.origin}/?room=${roomCode}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            <T>Invite Players</T>
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            <T>Share this link with friends to play together</T>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {isCreating || !roomCode ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              <T>
                <span className="text-slate-400">Creating room...</span>
              </T>
            </div>
          ) : (
            <>
              {/* Room Code */}
              <div className="text-center">
                <div className="text-4xl font-mono font-bold tracking-widest text-white mb-2">
                  {roomCode}
                </div>
                <T>
                  <div className="text-sm text-slate-400">Room Code</div>
                </T>
              </div>

              {/* Copy Link */}
              <div className="flex gap-2">
                <div className="flex-1 bg-slate-800 rounded-lg px-4 py-3 text-sm text-slate-300 truncate">
                  {inviteUrl}
                </div>
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="shrink-0 border-slate-600 hover:bg-slate-700"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Player Count */}
              <div className="text-center text-sm text-slate-400">
                <span className="text-white font-medium">{players.length}</span> {gt('{count} player{s} connected', { count: players.length, s: players.length !== 1 ? 's' : '' })}
              </div>

              {/* Continue Button */}
              <Button
                onClick={() => onOpenChange(false)}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
              >
                <T>Continue Playing</T>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
