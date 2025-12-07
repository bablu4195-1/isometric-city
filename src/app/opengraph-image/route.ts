import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Static list of game screenshots
const GAME_IMAGES = [
  'IMG_6902.PNG',
  'IMG_6903.PNG',
  'IMG_6904.PNG',
  'IMG_6906.PNG',
  'IMG_6907.PNG',
  'IMG_6908.PNG',
  'IMG_6909.PNG',
  'IMG_6910.PNG',
  'IMG_6911.PNG',
];

// Allow opting into a deterministic screenshot by setting NEXT_PUBLIC_OG_IMAGE_INDEX
const OG_IMAGE_INDEX = process.env.NEXT_PUBLIC_OG_IMAGE_INDEX;

function pickImage(): string | null {
  if (OG_IMAGE_INDEX !== undefined) {
    const parsedIndex = parseInt(OG_IMAGE_INDEX, 10);
    if (!Number.isNaN(parsedIndex) && GAME_IMAGES.length > 0) {
      return GAME_IMAGES[((parsedIndex % GAME_IMAGES.length) + GAME_IMAGES.length) % GAME_IMAGES.length];
    }
  }

  if (GAME_IMAGES.length === 0) {
    return null;
  }

  return GAME_IMAGES[Math.floor(Math.random() * GAME_IMAGES.length)];
}

export async function GET() {
  try {
    const selectedImage = pickImage();
    const imagePath = selectedImage
      ? path.join(process.cwd(), 'public', 'games', selectedImage)
      : path.join(process.cwd(), 'public', 'og-image.png');
    const imageBuffer = await readFile(imagePath);
    
    // Return the image directly with proper headers for social media crawlers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': imageBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error serving OG image:', error);
    
    // Fallback to the static og-image.png
    try {
      const fallbackPath = path.join(process.cwd(), 'public', 'og-image.png');
      const fallbackBuffer = await readFile(fallbackPath);
      
      return new NextResponse(fallbackBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': fallbackBuffer.length.toString(),
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      });
    } catch {
      return new NextResponse('Image not found', { status: 404 });
    }
  }
}
