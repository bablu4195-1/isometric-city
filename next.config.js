/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable gzip/brotli compression for HTML/JS/CSS responses.
  // (This doesn't compress raw PNG/WebP bytes, but it helps overall page load.)
  compress: true,

  // Ensure Next/Image serves modern formats where used.
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Cache static game assets aggressively (sprite sheets, water textures, etc.).
  // These rarely change and are large, so caching helps a lot on repeat visits.
  async headers() {
    return [
      {
        source: '/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig





