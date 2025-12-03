import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getRandomOgImagePath, getFallbackOgImagePath } from '@/lib/ogImages';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const CACHE_CONTROL_HEADER = 'public, max-age=86400, immutable';

export const dynamic = 'force-dynamic';

const sanitizeRelativePath = (value: string): string => value.replace(/^\/+/, '');

async function readImageBuffer(relativePath: string) {
  const sanitizedPath = sanitizeRelativePath(relativePath);
  const absolutePath = path.join(PUBLIC_DIR, sanitizedPath);
  return fs.readFile(absolutePath);
}

export async function GET() {
  const selectedImagePath = getRandomOgImagePath();
  const fallbackImagePath = getFallbackOgImagePath();

  let imageBuffer: Buffer | null = null;

  try {
    imageBuffer = await readImageBuffer(selectedImagePath);
  } catch (error) {
    console.error(`Failed to load OG image "${selectedImagePath}":`, error);
  }

  if (!imageBuffer && selectedImagePath !== fallbackImagePath) {
    try {
      imageBuffer = await readImageBuffer(fallbackImagePath);
    } catch (error) {
      console.error(`Failed to load fallback OG image "${fallbackImagePath}":`, error);
    }
  }

  if (!imageBuffer) {
    return NextResponse.json(
      { error: 'Unable to load Open Graph image.' },
      { status: 500 }
    );
  }

  const headers = new Headers({
    'Content-Type': 'image/png',
    'Cache-Control': CACHE_CONTROL_HEADER,
    'Content-Length': imageBuffer.length.toString(),
  });

  return new NextResponse(imageBuffer, { headers });
}
