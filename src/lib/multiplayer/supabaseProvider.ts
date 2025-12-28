// Supabase Realtime multiplayer provider with database-backed state persistence

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import {
  GameAction,
  GameActionInput,
  Player,
  generatePlayerId,
  generatePlayerColor,
  generatePlayerName,
} from './types';
import {
  createGameRoom,
  loadGameRoom,
  updateGameRoom,
  updatePlayerCount,
} from './database';
import { GameState } from '@/types/game';
import { msg } from 'gt-next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Throttle state saves to avoid excessive database writes
const STATE_SAVE_INTERVAL = 3000; // Save state every 3 seconds max

export interface MultiplayerProviderOptions {
  roomCode: string;
  cityName: string;
  playerName?: string; // Optional - auto-generated if not provided
  initialGameState?: GameState; // If provided, this player is creating the room
  onConnectionChange?: (connected: boolean, peerCount: number) => void;
  onPlayersChange?: (players: Player[]) => void;
  onAction?: (action: GameAction) => void;
  onStateReceived?: (state: GameState) => void;
  onError?: (error: string) => void;
}

export class MultiplayerProvider {
  public readonly roomCode: string;
  public readonly peerId: string;
  public readonly isCreator: boolean; // Whether this player created the room

  private channel: RealtimeChannel;
  private player: Player;
  private options: MultiplayerProviderOptions;
  private players: Map<string, Player> = new Map();
  private gameState: GameState | null = null;
  private destroyed = false;
  private hasReceivedInitialState = false; // Prevent multiple state-sync overwrites
  
  // State save throttling
  private lastStateSave = 0;
  private pendingStateSave: GameState | null = null;
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Presence/UI throttling to avoid rerender spam on mobile
  private playersNotifyTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastPlayersSignature = '';
  private lastPlayerCountUpdate = 0;
  private pendingPlayerCountUpdate: number | null = null;
  private playerCountTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastConnectionPeerCount: number | null = null;
  private lastConnectionConnected: boolean | null = null;

  constructor(options: MultiplayerProviderOptions) {
    this.options = options;
    this.roomCode = options.roomCode;
    this.peerId = generatePlayerId();
    this.gameState = options.initialGameState || null;
    this.isCreator = !!options.initialGameState;

    // Create player info
    this.player = {
      id: this.peerId,
      name: options.playerName || generatePlayerName(),
      color: generatePlayerColor(),
      joinedAt: Date.now(),
      isHost: false, // Legacy field, kept for compatibility
    };

    // Add self to players
    this.players.set(this.peerId, this.player);

    // Create Supabase Realtime channel
    this.channel = supabase.channel(`room-${options.roomCode}`, {
      config: {
        presence: { key: this.peerId },
        broadcast: { self: false }, // Don't receive our own broadcasts
      },
    });
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    // If creating a room, save initial state to database
    if (this.isCreator && this.gameState) {
      // Creator has the canonical state - mark as already received
      this.hasReceivedInitialState = true;
      const success = await createGameRoom(
        this.roomCode,
        this.options.cityName,
        this.gameState
      );
      if (!success) {
        this.options.onError?.(msg('Failed to create room in database'));
        throw new Error(msg('Failed to create room in database'));
      }
    } else {
      // Joining an existing room - load state from database
      const roomData = await loadGameRoom(this.roomCode);
      if (!roomData) {
        this.options.onError?.(msg('Room not found'));
        throw new Error(msg('Room not found'));
      }
      this.gameState = roomData.gameState;
      // Note: We do NOT set hasReceivedInitialState here because we want to
      // receive state-sync from existing players (which will have fresher state)
      // Notify that we received state from the database
      this.options.onStateReceived?.(roomData.gameState);
    }

    // Set up all channel listeners in a single chain
    this.channel
      // Presence: track who's in the room
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        this.players.clear();
        this.players.set(this.peerId, this.player);

        Object.entries(state).forEach(([key, presences]) => {
          if (key !== this.peerId && presences.length > 0) {
            const presence = presences[0] as unknown as { player: Player };
            if (presence.player) {
              this.players.set(key, presence.player);
            }
          }
        });

        this.notifyPlayersChange();
        this.updateConnectionStatus();
        this.schedulePlayerCountUpdate(this.players.size);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key !== this.peerId && newPresences.length > 0) {
          const presence = newPresences[0] as unknown as { player: Player };
          if (presence.player) {
            this.players.set(key, presence.player);
            this.notifyPlayersChange();
            this.updateConnectionStatus();
            
            // When a new player joins, ONLY ONE existing player should send state-sync.
            // Otherwise every peer serializes + transmits a huge payload (very expensive on mobile).
            const shouldSendState =
              !!this.gameState &&
              !this.destroyed &&
              (() => {
                const ids = Array.from(this.players.keys()).sort();
                return ids.length > 0 && ids[0] === this.peerId;
              })();

            if (shouldSendState) {
              setTimeout(() => {
                if (!this.destroyed && this.gameState) {
                  this.channel.send({
                    type: 'broadcast',
                    event: 'state-sync',
                    payload: {
                      state: this.gameState,
                      to: key,
                      from: this.peerId,
                    },
                  });
                }
              }, Math.random() * 150);
            }
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        this.players.delete(key);
        this.notifyPlayersChange();
        this.updateConnectionStatus();
        
        this.schedulePlayerCountUpdate(this.players.size);
      })
      // Broadcast: real-time game actions from other players
      .on('broadcast', { event: 'action' }, ({ payload }) => {
        const action = payload as GameAction;
        // Guard against malformed payloads
        if (!action || !action.type || !action.playerId) {
          console.warn('[Multiplayer] Received invalid action payload:', payload);
          return;
        }
        if (action.playerId !== this.peerId && this.options.onAction) {
          this.options.onAction(action);
        }
      })
      // Broadcast: state sync from existing players (for new joiners)
      .on('broadcast', { event: 'state-sync' }, ({ payload }) => {
        const { state, to, from } = payload as { state: GameState; to: string; from: string };
        // Only process if:
        // 1. It's meant for us
        // 2. We're NOT the creator (creators have the canonical state, should never be overwritten)
        // 3. We haven't already received initial state (prevent multiple overwrites)
        // 4. It's not from ourselves (extra safety)
        // 5. State is valid
        if (to === this.peerId && !this.isCreator && !this.hasReceivedInitialState && from !== this.peerId && state && this.options.onStateReceived) {
          this.hasReceivedInitialState = true;
          this.gameState = state;
          this.options.onStateReceived(state);
        }
      });

    // Subscribe and track presence
    await this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await this.channel.track({ player: this.player });
        
        // Notify connected
        if (this.options.onConnectionChange) {
          this.options.onConnectionChange(true, this.players.size);
        }
        this.notifyPlayersChange();
      }
    });
  }

  dispatchAction(action: GameActionInput): void {
    if (this.destroyed) return;

    const fullAction: GameAction = {
      ...action,
      timestamp: Date.now(),
      playerId: this.peerId,
    };

    // Broadcast to all peers
    this.channel.send({
      type: 'broadcast',
      event: 'action',
      payload: fullAction,
    });
  }

  /**
   * Update the game state and save to database (throttled)
   */
  updateGameState(state: GameState): void {
    this.gameState = state;
    
    const now = Date.now();
    const timeSinceLastSave = now - this.lastStateSave;
    
    if (timeSinceLastSave >= STATE_SAVE_INTERVAL) {
      // Save immediately
      this.saveStateToDatabase(state);
    } else {
      // Queue the save for later
      this.pendingStateSave = state;
      
      if (!this.saveTimeout) {
        this.saveTimeout = setTimeout(() => {
          this.saveTimeout = null;
          if (this.pendingStateSave && !this.destroyed) {
            this.saveStateToDatabase(this.pendingStateSave);
            this.pendingStateSave = null;
          }
        }, STATE_SAVE_INTERVAL - timeSinceLastSave);
      }
    }
  }

  private saveStateToDatabase(state: GameState): void {
    this.lastStateSave = Date.now();
    updateGameRoom(this.roomCode, state).catch((e) => {
      console.error('[Multiplayer] Failed to save state to database:', e);
    });
  }

  private updateConnectionStatus(): void {
    if (this.options.onConnectionChange) {
      const connected = true;
      const peerCount = this.players.size;
      if (this.lastConnectionConnected === connected && this.lastConnectionPeerCount === peerCount) return;
      this.lastConnectionConnected = connected;
      this.lastConnectionPeerCount = peerCount;
      this.options.onConnectionChange(connected, peerCount);
    }
  }

  private notifyPlayersChange(): void {
    if (!this.options.onPlayersChange) return;

    // Throttle + dedupe to reduce React churn
    const nextPlayers = Array.from(this.players.values()).sort((a, b) => a.id.localeCompare(b.id));
    const signature = nextPlayers.map((p) => `${p.id}:${p.name}`).join('|');
    if (signature === this.lastPlayersSignature) return;
    this.lastPlayersSignature = signature;

    if (this.playersNotifyTimeout) return;
    this.playersNotifyTimeout = setTimeout(() => {
      this.playersNotifyTimeout = null;
      if (this.destroyed) return;
      // Re-evaluate from latest map (and signature already updated)
      this.options.onPlayersChange?.(Array.from(this.players.values()).sort((a, b) => a.id.localeCompare(b.id)));
    }, 200);
  }

  private schedulePlayerCountUpdate(count: number): void {
    const now = Date.now();
    // Debounce + throttle DB writes (presence can be noisy)
    if (now - this.lastPlayerCountUpdate >= 1000) {
      this.lastPlayerCountUpdate = now;
      updatePlayerCount(this.roomCode, count);
      return;
    }
    this.pendingPlayerCountUpdate = count;
    if (this.playerCountTimeout) return;
    this.playerCountTimeout = setTimeout(() => {
      this.playerCountTimeout = null;
      if (this.destroyed) return;
      if (this.pendingPlayerCountUpdate === null) return;
      this.lastPlayerCountUpdate = Date.now();
      updatePlayerCount(this.roomCode, this.pendingPlayerCountUpdate);
      this.pendingPlayerCountUpdate = null;
    }, 1000);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    
    // Save any pending state before disconnecting
    if (this.pendingStateSave) {
      this.saveStateToDatabase(this.pendingStateSave);
      this.pendingStateSave = null;
    }
    
    // Clear save timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.playersNotifyTimeout) {
      clearTimeout(this.playersNotifyTimeout);
      this.playersNotifyTimeout = null;
    }
    if (this.playerCountTimeout) {
      clearTimeout(this.playerCountTimeout);
      this.playerCountTimeout = null;
    }
    this.pendingPlayerCountUpdate = null;
    
    this.channel.unsubscribe();
    supabase.removeChannel(this.channel);
  }
}

// Create and connect a multiplayer provider
export async function createMultiplayerProvider(
  options: MultiplayerProviderOptions
): Promise<MultiplayerProvider> {
  const provider = new MultiplayerProvider(options);
  await provider.connect();
  return provider;
}
