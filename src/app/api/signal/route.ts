import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/edge-config';
import { tx } from 'gt-next/server';

// Extract Edge Config ID from connection string
function getEdgeConfigId(): string | null {
  const edgeConfig = process.env.EDGE_CONFIG;
  if (!edgeConfig) return null;
  const match = edgeConfig.match(/edge-config\.vercel\.com\/(ecfg_[^?]+)/);
  return match ? match[1] : null;
}

const EDGE_CONFIG_ID = getEdgeConfigId();
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;

// Signal TTL: 30 seconds
const SIGNAL_TTL_MS = 30 * 1000;

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to?: string;
  payload: unknown;
  timestamp: number;
}

interface RoomData {
  code: string;
  hostId: string;
  cityName: string;
  createdAt: number;
  signals: SignalMessage[];
}

// Write to Edge Config via Vercel REST API
async function writeToEdgeConfig(key: string, value: unknown): Promise<boolean> {
  if (!EDGE_CONFIG_ID || !VERCEL_API_TOKEN) {
    console.error('Missing EDGE_CONFIG_ID or VERCEL_API_TOKEN');
    return false;
  }

  try {
    const response = await fetch(
      `https://api.vercel.com/v1/edge-config/${EDGE_CONFIG_ID}/items`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              operation: 'upsert',
              key,
              value,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Edge Config write failed:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Edge Config write error:', error);
    return false;
  }
}

// POST: Send a signaling message
export async function POST(request: NextRequest) {
  try {
    const { roomCode, type, from, to, payload } = await request.json();

    if (!roomCode || !type || !from || !payload) {
      return NextResponse.json(
        { error: await tx('Missing required fields', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
        { status: 400 }
      );
    }

    // Get current room data
    const room = await get<RoomData>(`room_${roomCode.toUpperCase()}`);
    if (!room) {
      return NextResponse.json({ error: await tx('Room not found', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) }, { status: 404 });
    }

    // Create new signal
    const signal: SignalMessage = {
      type,
      from,
      to,
      payload,
      timestamp: Date.now(),
    };

    // Filter out expired signals and add new one
    const now = Date.now();
    const activeSignals = (room.signals || []).filter(
      (s) => now - s.timestamp < SIGNAL_TTL_MS
    );
    activeSignals.push(signal);

    // Update room with new signals
    const updatedRoom: RoomData = {
      ...room,
      signals: activeSignals,
    };

    const success = await writeToEdgeConfig(`room_${roomCode.toUpperCase()}`, updatedRoom);
    if (!success) {
      return NextResponse.json(
        { error: await tx('Failed to send signal', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending signal:', error);
    return NextResponse.json(
      { error: await tx('Failed to send signal', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
      { status: 500 }
    );
  }
}

// GET: Poll for signaling messages
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomCode = searchParams.get('roomCode');
    const peerId = searchParams.get('peerId');
    // Use 'lastSeen' to track which signals we've already processed
    const lastSeen = searchParams.get('lastSeen') || '';

    if (!roomCode || !peerId) {
      return NextResponse.json(
        { error: await tx('Missing roomCode or peerId', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
        { status: 400 }
      );
    }

    // Get room data (ultra-fast Edge Config read)
    const room = await get<RoomData>(`room_${roomCode.toUpperCase()}`);
    if (!room) {
      return NextResponse.json({ error: await tx('Room not found', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) }, { status: 404 });
    }

    // Parse lastSeen as a set of signal IDs we've already processed
    const seenIds = new Set(lastSeen ? lastSeen.split(',') : []);

    // Filter signals:
    // 1. Not from ourselves
    // 2. Either broadcast (no 'to') or addressed to us
    // 3. Not already seen (by signal ID = from + timestamp)
    // 4. Not expired
    const now = Date.now();
    const signals = (room.signals || []).filter((s) => {
      const signalId = `${s.from}-${s.timestamp}`;
      return (
        s.from !== peerId &&
        (!s.to || s.to === peerId) &&
        !seenIds.has(signalId) &&
        now - s.timestamp < SIGNAL_TTL_MS
      );
    });

    // Generate new lastSeen string with all signal IDs
    const allSignalIds = (room.signals || [])
      .filter((s) => s.from !== peerId && now - s.timestamp < SIGNAL_TTL_MS)
      .map((s) => `${s.from}-${s.timestamp}`);
    const newLastSeen = [...seenIds, ...allSignalIds.filter(id => !seenIds.has(id))].join(',');

    // Debug: log what signals exist vs what we're returning
    const allSignals = room.signals || [];
    console.log(`[Signal API] Room ${roomCode}: ${allSignals.length} total signals, returning ${signals.length} for peer ${peerId}`);
    
    return NextResponse.json({
      signals: signals.sort((a, b) => a.timestamp - b.timestamp),
      lastSeen: newLastSeen,
      timestamp: now,
      allSignalsCount: allSignals.length,
    });
  } catch (error) {
    console.error('Error polling signals:', error);
    return NextResponse.json(
      { error: await tx('Failed to poll signals', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
      { status: 500 }
    );
  }
}
