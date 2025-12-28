'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useSyncExternalStore,
} from 'react';
import {
  MultiplayerProvider,
  createMultiplayerProvider,
} from '@/lib/multiplayer/supabaseProvider';
import {
  GameAction,
  GameActionInput,
  Player,
  ConnectionState,
  RoomData,
} from '@/lib/multiplayer/types';
import { GameState } from '@/types/game';
import { useGT } from 'gt-next';

// Generate a random 5-character room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

interface MultiplayerContextValue {
  // Connection state
  connectionState: ConnectionState;
  roomCode: string | null;
  error: string | null;

  // Players (presence) - stored outside React state to avoid full-tree rerenders
  // Subscribe via useMultiplayerPlayers()
  subscribePlayers: (listener: () => void) => () => void;
  getPlayersSnapshot: () => Player[];

  // Actions
  createRoom: (cityName: string, initialState: GameState) => Promise<string>;
  joinRoom: (roomCode: string) => Promise<RoomData>;
  leaveRoom: () => void;
  
  // Game action dispatch
  dispatchAction: (action: GameActionInput) => void;
  
  // Initial state for new players
  initialState: GameState | null;
  
  // Callback for when remote actions are received
  onRemoteAction: ((action: GameAction) => void) | null;
  setOnRemoteAction: (callback: ((action: GameAction) => void) | null) => void;
  
  // Update the game state (any player can do this now)
  updateGameState: (state: GameState) => void;
  
  // Provider instance (for advanced usage)
  provider: MultiplayerProvider | null;
  
  // Legacy compatibility - always false now since there's no host
  isHost: boolean;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const gt = useGT();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialState, setInitialState] = useState<GameState | null>(null);
  const [provider, setProvider] = useState<MultiplayerProvider | null>(null);
  const [onRemoteAction, setOnRemoteAction] = useState<((action: GameAction) => void) | null>(null);

  const providerRef = useRef<MultiplayerProvider | null>(null);
  const onRemoteActionRef = useRef<((action: GameAction) => void) | null>(null);

  // Players store (external) to avoid rerendering the entire app on presence sync spam
  const playersRef = useRef<Player[]>([]);
  const playersListenersRef = useRef<Set<() => void>>(new Set());
  const playersSignatureRef = useRef<string>('');

  const getPlayersSnapshot = useCallback(() => playersRef.current, []);

  const subscribePlayers = useCallback((listener: () => void) => {
    playersListenersRef.current.add(listener);
    return () => {
      playersListenersRef.current.delete(listener);
    };
  }, []);

  const notifyPlayersListeners = useCallback(() => {
    for (const listener of playersListenersRef.current) {
      try {
        listener();
      } catch (e) {
        console.error('[MultiplayerContext] players listener error', e);
      }
    }
  }, []);

  const setPlayersSnapshot = useCallback(
    (nextPlayers: Player[]) => {
      // Deduplicate + stable sort so signature is consistent across clients
      const uniqueById = new Map<string, Player>();
      for (const p of nextPlayers) uniqueById.set(p.id, p);
      const normalized = Array.from(uniqueById.values()).sort((a, b) => a.id.localeCompare(b.id));
      const signature = normalized.map((p) => `${p.id}:${p.name}`).join('|');
      if (signature === playersSignatureRef.current) return;
      playersSignatureRef.current = signature;
      playersRef.current = normalized;
      notifyPlayersListeners();
    },
    [notifyPlayersListeners]
  );

  // Set up remote action callback
  const handleSetOnRemoteAction = useCallback(
    (callback: ((action: GameAction) => void) | null) => {
      onRemoteActionRef.current = callback;
      setOnRemoteAction(callback);
    },
    []
  );

  // Create a room (first player to start a session)
  const createRoom = useCallback(
    async (cityName: string, gameState: GameState): Promise<string> => {
      setConnectionState('connecting');
      setError(null);

      try {
        // Generate room code
        const newRoomCode = generateRoomCode();

        // Create multiplayer provider with initial state
        // State will be saved to Supabase database
        const provider = await createMultiplayerProvider({
          roomCode: newRoomCode,
          cityName,
          initialGameState: gameState,
          onConnectionChange: (connected) => {
            setConnectionState(connected ? 'connected' : 'disconnected');
          },
          onPlayersChange: (newPlayers) => {
            setPlayersSnapshot(newPlayers);
          },
          onAction: (action) => {
            if (onRemoteActionRef.current) {
              onRemoteActionRef.current(action);
            }
          },
          onError: (errorMsg) => {
            setError(errorMsg);
            setConnectionState('error');
          },
        });

        providerRef.current = provider;
        setProvider(provider);
        setRoomCode(newRoomCode);
        setConnectionState('connected');

        return newRoomCode;
      } catch (err) {
        setConnectionState('error');
        setError(err instanceof Error ? err.message : gt('Failed to create room'));
        throw err;
      }
    },
    [gt, setPlayersSnapshot]
  );

  // Join an existing room
  const joinRoom = useCallback(
    async (code: string): Promise<RoomData> => {
      setConnectionState('connecting');
      setError(null);

      try {
        const normalizedCode = code.toUpperCase();

        // Create multiplayer provider - state will be loaded from Supabase database
        const provider = await createMultiplayerProvider({
          roomCode: normalizedCode,
          cityName: gt('Co-op City'),
          // No initialGameState - we'll load from database
          onConnectionChange: (connected) => {
            setConnectionState(connected ? 'connected' : 'disconnected');
          },
          onPlayersChange: (newPlayers) => {
            setPlayersSnapshot(newPlayers);
          },
          onAction: (action) => {
            if (onRemoteActionRef.current) {
              onRemoteActionRef.current(action);
            }
          },
          onStateReceived: (state) => {
            // State loaded from database
            setInitialState(state);
          },
          onError: (errorMsg) => {
            setError(errorMsg);
            setConnectionState('error');
          },
        });

        providerRef.current = provider;
        setProvider(provider);
        setRoomCode(normalizedCode);
        setConnectionState('connected');

        // Return room data
        const room: RoomData = {
          code: normalizedCode,
          hostId: '',
          cityName: gt('Co-op City'),
          createdAt: Date.now(),
          playerCount: 1,
        };

        return room;
      } catch (err) {
        setConnectionState('error');
        setError(err instanceof Error ? err.message : gt('Failed to join room'));
        throw err;
      }
    },
    [gt, setPlayersSnapshot]
  );

  // Leave the current room
  const leaveRoom = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }

    setProvider(null);
    setConnectionState('disconnected');
    setRoomCode(null);
    setPlayersSnapshot([]);
    setError(null);
    setInitialState(null);
  }, [setPlayersSnapshot]);

  // Dispatch a game action to all peers
  const dispatchAction = useCallback(
    (action: GameActionInput) => {
      if (providerRef.current) {
        providerRef.current.dispatchAction(action);
      }
    },
    []
  );

  // Update the game state (any player can do this)
  const updateGameState = useCallback(
    (state: GameState) => {
      if (providerRef.current) {
        providerRef.current.updateGameState(state);
      }
    },
    []
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
      }
    };
  }, []);

  const value: MultiplayerContextValue = useMemo(
    () => ({
      connectionState,
      roomCode,
      error,
      subscribePlayers,
      getPlayersSnapshot,
      createRoom,
      joinRoom,
      leaveRoom,
      dispatchAction,
      initialState,
      onRemoteAction,
      setOnRemoteAction: handleSetOnRemoteAction,
      updateGameState,
      provider,
      isHost: false, // No longer meaningful - kept for compatibility
    }),
    [
      connectionState,
      roomCode,
      error,
      subscribePlayers,
      getPlayersSnapshot,
      createRoom,
      joinRoom,
      leaveRoom,
      dispatchAction,
      initialState,
      onRemoteAction,
      handleSetOnRemoteAction,
      updateGameState,
      provider,
    ]
  );

  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayer() {
  const context = useContext(MultiplayerContext);
  if (!context) {
    throw new Error('useMultiplayer must be used within a MultiplayerContextProvider');
  }
  return context;
}

export function useMultiplayerPlayers(): Player[] {
  const context = useContext(MultiplayerContext);
  const subscribe = context?.subscribePlayers ?? (() => () => {});
  const getSnapshot = context?.getPlayersSnapshot ?? (() => []);
  return useSyncExternalStore(subscribe, getSnapshot, () => []);
}

// Optional hook that returns null if not in multiplayer context
export function useMultiplayerOptional() {
  return useContext(MultiplayerContext);
}
