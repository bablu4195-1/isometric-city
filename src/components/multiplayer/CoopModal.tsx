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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMultiplayer } from '@/context/MultiplayerContext';
import { GameState } from '@/types/game';
import { createInitialGameState, DEFAULT_GRID_SIZE } from '@/lib/simulation';
import { Copy, Check, Users, Loader2, AlertCircle } from 'lucide-react';
import { T, useGT } from 'gt-next';

interface CoopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartGame: (isHost: boolean, initialState?: GameState) => void;
  currentGameState?: GameState;
  pendingRoomCode?: string | null;
}

type Mode = 'select' | 'create' | 'join';

export function CoopModal({
  open,
  onOpenChange,
  onStartGame,
  currentGameState,
  pendingRoomCode,
}: CoopModalProps) {
  const [mode, setMode] = useState<Mode>('select');
  const [cityName, setCityName] = useState('My Co-op City');
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);
  const [waitingForState, setWaitingForState] = useState(false);

  const {
    connectionState,
    roomCode,
    players,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    initialState,
  } = useMultiplayer();

  const gt = useGT();

  // Generate player name on mount
  useEffect(() => {
    if (!playerName) {
      setPlayerName(`Player ${Math.floor(Math.random() * 9999)}`);
    }
  }, [playerName]);

  // Auto-fill join code and switch to join mode when there's a pending room code
  useEffect(() => {
    if (open && pendingRoomCode && !autoJoinAttempted) {
      setJoinCode(pendingRoomCode);
      setMode('join');
      setAutoJoinAttempted(true);
    }
  }, [open, pendingRoomCode, autoJoinAttempted]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setMode('select');
      setIsLoading(false);
      setCopied(false);
      setAutoJoinAttempted(false);
      setWaitingForState(false);
    }
  }, [open]);

  const handleCreateRoom = async () => {
    if (!cityName.trim() || !playerName.trim()) return;
    
    setIsLoading(true);
    try {
      // Create a fresh city for co-op
      const stateToShare = createInitialGameState(DEFAULT_GRID_SIZE, cityName);
      
      const code = await createRoom(cityName, playerName, stateToShare);
      // Update URL to show room code
      window.history.replaceState({}, '', `/?room=${code}`);
      
      // Start the game immediately with the fresh state
      onStartGame(true, stateToShare);
    } catch (err) {
      console.error('Failed to create room:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim() || !playerName.trim()) return;
    if (joinCode.length !== 5) return;
    
    setIsLoading(true);
    try {
      const room = await joinRoom(joinCode, playerName);
      // Update URL to show room code
      window.history.replaceState({}, '', `/?room=${joinCode.toUpperCase()}`);
      // Now wait for WebRTC to connect and state to be received
      setIsLoading(false);
      setWaitingForState(true);
    } catch (err) {
      console.error('Failed to join room:', err);
      setIsLoading(false);
    }
  };
  
  // When we receive the initial state from host, start the game
  useEffect(() => {
    if (waitingForState && initialState) {
      setWaitingForState(false);
      onStartGame(false, initialState);
      onOpenChange(false);
    }
  }, [waitingForState, initialState, onStartGame, onOpenChange]);
  
  // Timeout after 30 seconds if we can't connect
  useEffect(() => {
    if (!waitingForState) return;
    
    const timeout = setTimeout(() => {
      if (waitingForState && !initialState) {
        console.error('[CoopModal] Timeout waiting for state from host');
        setWaitingForState(false);
        leaveRoom();
      }
    }, 60000); // 60 seconds to allow more time for connection
    
    return () => clearTimeout(timeout);
  }, [waitingForState, initialState, leaveRoom]);

  const handleCopyLink = () => {
    if (!roomCode) return;
    
    const url = `${window.location.origin}/?room=${roomCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBack = () => {
    if (roomCode) {
      leaveRoom();
    }
    setMode('select');
  };

  // Selection screen
  if (mode === 'select') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-light text-white">
              <T>Co-op Multiplayer</T>
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              <T>Build a city together with friends in real-time</T>
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 mt-4">
            <Button
              onClick={() => setMode('create')}
              className="w-full py-6 text-lg font-light bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-none"
            >
              <T>Create Room</T>
            </Button>
            <Button
              onClick={() => setMode('join')}
              variant="outline"
              className="w-full py-6 text-lg font-light bg-transparent hover:bg-white/10 text-white/70 hover:text-white border border-white/15 rounded-none"
            >
              <T>Join Room</T>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Create room screen
  if (mode === 'create') {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-light text-white">
              <T>Create Co-op Room</T>
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {roomCode
                ? gt('Share the room code with friends to invite them')
                : gt('Set up your co-op city')
              }
            </DialogDescription>
          </DialogHeader>

          {!roomCode ? (
            <div className="flex flex-col gap-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="cityName" className="text-slate-300">
                  <T>City Name</T>
                </Label>
                <Input
                  id="cityName"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  placeholder={gt('My Co-op City')}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="playerName" className="text-slate-300">
                  <T>Your Name</T>
                </Label>
                <Input
                  id="playerName"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder={gt('Player 1')}
                  className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <Button
                  onClick={handleBack}
                  variant="outline"
                  className="flex-1 bg-transparent hover:bg-white/10 text-white/70 border-white/20 rounded-none"
                >
                  <T>Back</T>
                </Button>
                <Button
                  onClick={handleCreateRoom}
                  disabled={isLoading || !cityName.trim() || !playerName.trim()}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-none"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <T>Creating...</T>
                    </>
                  ) : (
                    <T>Create Room</T>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-4">
              {/* Room Code Display */}
              <div className="bg-slate-800 rounded-lg p-6 text-center">
                <T>
                  <p className="text-slate-400 text-sm mb-2">Room Code</p>
                </T>
                <p className="text-4xl font-mono font-bold tracking-widest text-white">
                  {roomCode}
                </p>
              </div>

              {/* Copy Link Button */}
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="w-full bg-transparent hover:bg-white/10 text-white border-white/20 rounded-none"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    <T>Copied!</T>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    <T>Copy Invite Link</T>
                  </>
                )}
              </Button>

              {/* Connected Players - only show when others have joined */}
              {players.length > 1 && (
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-slate-300 mb-3">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {gt('Players ({count})', { count: players.length })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: player.color }}
                        />
                        <span className="text-white">{player.name}</span>
                        {player.isHost && (
                          <T>
                            <span className="text-xs text-slate-500">(Host)</span>
                          </T>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Waiting message when no one else has joined */}
              {players.length <= 1 && (
                <T>
                  <p className="text-center text-slate-400 text-sm">
                    Waiting for players to join...
                  </p>
                </T>
              )}

              {/* Continue button - game already started, just close the modal */}
              <Button
                onClick={() => onOpenChange(false)}
                className="w-full mt-2 bg-slate-700 hover:bg-slate-600 text-white border border-slate-600 rounded-md"
              >
                <T>Continue Playing</T>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // Join room screen
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-700 text-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-light text-white">
            <T>Join Co-op Room</T>
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            <T>Enter the 5-character room code to join</T>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="joinCode" className="text-slate-300">
              <T>Room Code</T>
            </Label>
            <Input
              id="joinCode"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="ABCDE"
              maxLength={5}
              className="bg-slate-800 border-slate-600 text-white text-center text-2xl font-mono tracking-widest placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="playerNameJoin" className="text-slate-300">
              <T>Your Name</T>
            </Label>
            <Input
              id="playerNameJoin"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={gt('Player 2')}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Connection Status when joining */}
          {connectionState === 'connecting' && !waitingForState && (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <T>Connecting to room...</T>
            </div>
          )}

          {/* Waiting for state from host */}
          {waitingForState && (
            <div className="bg-slate-800/50 rounded-lg p-4 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
              <T>
                <p className="text-slate-300 text-sm">Connecting to host...</p>
              </T>
              <T>
                <p className="text-slate-500 text-xs mt-1">Waiting for game state</p>
              </T>
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <Button
              onClick={handleBack}
              variant="outline"
              className="flex-1 bg-transparent hover:bg-white/10 text-white/70 border-white/20 rounded-none"
            >
              <T>Back</T>
            </Button>
            <Button
              onClick={handleJoinRoom}
              disabled={isLoading || joinCode.length !== 5 || !playerName.trim()}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-none"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <T>Joining...</T>
                </>
              ) : (
                <T>Join Room</T>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
