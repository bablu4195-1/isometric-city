import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/edge-config';
import { tx } from 'gt-next/server';

// Extract Edge Config ID from connection string
// Format: https://edge-config.vercel.com/ecfg_xxx?token=yyy
function getEdgeConfigId(): string | null {
  const edgeConfig = process.env.EDGE_CONFIG;
  if (!edgeConfig) return null;
  const match = edgeConfig.match(/edge-config\.vercel\.com\/(ecfg_[^?]+)/);
  return match ? match[1] : null;
}

const EDGE_CONFIG_ID = getEdgeConfigId();
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;

// Rate limit: 100 rooms per IP per hour for development (stored in memory for simplicity)
const RATE_LIMIT = 100;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

interface RoomData {
  code: string;
  hostId: string;
  cityName: string;
  createdAt: number;
  signals: SignalMessage[];
  // Game state is now synced via WebRTC P2P, not stored here
}

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  from: string;
  to?: string;
  payload: unknown;
  timestamp: number;
}

// Generate a random 5-character room code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Check rate limit
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
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

// Delete from Edge Config
async function deleteFromEdgeConfig(key: string): Promise<boolean> {
  if (!EDGE_CONFIG_ID || !VERCEL_API_TOKEN) {
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
              operation: 'delete',
              key,
            },
          ],
        }),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

// POST: Create a new room
export async function POST(request: NextRequest) {
  try {
    const { cityName, hostId } = await request.json();

    if (!cityName || !hostId) {
      return NextResponse.json(
        { error: await tx('Missing required fields', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
        { status: 400 }
      );
    }

    // Rate limiting by IP
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: await tx('Rate limit exceeded. Try again later.', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
        { status: 429 }
      );
    }

    // Generate unique room code
    let roomCode = generateRoomCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await get<RoomData>(`room_${roomCode}`);
      if (!existing) break;
      roomCode = generateRoomCode();
      attempts++;
    }

    // Create room (game state is synced via WebRTC P2P, not stored here)
    const room: RoomData = {
      code: roomCode,
      hostId,
      cityName,
      createdAt: Date.now(),
      signals: [],
    };

    const success = await writeToEdgeConfig(`room_${roomCode}`, room);
    if (!success) {
      return NextResponse.json(
        { error: await tx('Failed to create room', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
        { status: 500 }
      );
    }

    // Schedule room cleanup after 2 hours (in a real app, use a cron job)
    // For now, we'll clean up stale rooms on read

    return NextResponse.json({ room: { code: roomCode, hostId, cityName, createdAt: room.createdAt } });
  } catch (error) {
    console.error('Error creating room:', error);
    return NextResponse.json(
      { error: await tx('Failed to create room', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
      { status: 500 }
    );
  }
}

// GET: Get room info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: await tx('Missing room code', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) }, { status: 400 });
    }

    const room = await get<RoomData>(`room_${code.toUpperCase()}`);

    if (!room) {
      return NextResponse.json({ error: await tx('Room not found', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) }, { status: 404 });
    }

    // Check if room is stale (older than 2 hours)
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (Date.now() - room.createdAt > TWO_HOURS) {
      // Clean up stale room
      await deleteFromEdgeConfig(`room_${code.toUpperCase()}`);
      return NextResponse.json({ error: await tx('Room expired', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) }, { status: 404 });
    }

    return NextResponse.json({
      room: {
        code: room.code,
        hostId: room.hostId,
        cityName: room.cityName,
        createdAt: room.createdAt,
      }
    });
  } catch (error) {
    console.error('Error getting room:', error);
    return NextResponse.json(
      { error: await tx('Failed to get room', { locale: request.headers.get('accept-language')?.split(',')[0] || 'en' }) },
      { status: 500 }
    );
  }
}
