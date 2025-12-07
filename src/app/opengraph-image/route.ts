import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Mark this route as dynamic since it uses request.url
export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    // Pick a random image (or use a query param for consistent previews)
    const url = new URL(request.url);
    const imageIndex = url.searchParams.get('i');
    
    let selectedImage: string;
    if (imageIndex !== null && !isNaN(parseInt(imageIndex))) {
      const idx = parseInt(imageIndex) % GAME_IMAGES.length;
      selectedImage = GAME_IMAGES[idx];
    } else {
      selectedImage = GAME_IMAGES[Math.floor(Math.random() * GAME_IMAGES.length)];
    }
    
    // Read the image file directly from the public folder
    const imagePath = path.join(process.cwd(), 'public', 'games', selectedImage);
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
