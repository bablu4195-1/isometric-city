const RAW_GAME_IMAGE_PATHS = [
  'games/IMG_6902.PNG',
  'games/IMG_6903.PNG',
  'games/IMG_6904.PNG',
  'games/IMG_6906.PNG',
  'games/IMG_6907.PNG',
  'games/IMG_6908.PNG',
  'games/IMG_6909.PNG',
  'games/IMG_6910.PNG',
  'games/IMG_6911.PNG',
] as const;

const FALLBACK_IMAGE = 'og-image.png';

const sanitizeRelativePath = (value: string): string => value.replace(/^\/+/, '');

export const OG_IMAGE_DIMENSIONS = {
  width: 1179,
  height: 1406,
} as const;

const normalizedGameImagePaths: readonly string[] = Object.freeze(
  RAW_GAME_IMAGE_PATHS.map(sanitizeRelativePath)
);

const fallbackImagePath = sanitizeRelativePath(FALLBACK_IMAGE);

export function getOgImagePool(): string[] {
  return normalizedGameImagePaths.length > 0
    ? [...normalizedGameImagePaths]
    : [fallbackImagePath];
}

export function getRandomOgImagePath(): string {
  const pool = getOgImagePool();
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex] ?? fallbackImagePath;
}

export function getFallbackOgImagePath(): string {
  return fallbackImagePath;
}

export function toPublicPath(relativePath: string): string {
  return `/${sanitizeRelativePath(relativePath)}`;
}
