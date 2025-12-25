import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else {
      yield fullPath;
    }
  }
}

async function fileStatSafe(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function main() {
  const assetsStat = await fileStatSafe(ASSETS_DIR);
  if (!assetsStat) {
    throw new Error(`Assets directory not found: ${ASSETS_DIR}`);
  }

  let converted = 0;
  let skipped = 0;

  for await (const filePath of walk(ASSETS_DIR)) {
    if (!filePath.toLowerCase().endsWith('.png')) continue;

    const outPath = filePath.replace(/\.png$/i, '.webp');

    const [inStat, outStat] = await Promise.all([
      fs.stat(filePath),
      fileStatSafe(outPath),
    ]);

    if (outStat && outStat.mtimeMs >= inStat.mtimeMs) {
      skipped++;
      continue;
    }

    await sharp(filePath, { animated: false })
      // Pixel-art friendly: lossless WebP keeps crisp edges.
      .webp({ lossless: true, effort: 6 })
      .toFile(outPath);

    converted++;
  }

  console.log(
    `Optimized assets complete: ${converted} converted, ${skipped} up-to-date.`
  );
}

await main();

