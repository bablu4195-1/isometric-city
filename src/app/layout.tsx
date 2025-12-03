import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Playfair_Display, DM_Sans } from 'next/font/google';
import { OG_IMAGE_DIMENSIONS, getOgImagePool, toPublicPath } from '@/lib/ogImages';
import './globals.css';

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const SITE_TITLE = 'ISOCITY — Metropolis Builder';
const SITE_DESCRIPTION =
  'A richly detailed isometric city builder. Build your metropolis and manage resources with cars, planes, helicopters, boats, trains, citizens, and more.';

const buildDefaultBaseUrl = () => {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (configuredUrl) {
    try {
      return new URL(configuredUrl).toString();
    } catch {
      // Intentionally swallow errors and fall through to localhost.
    }
  }

  return 'http://localhost:3000';
};

const DEFAULT_BASE_URL = buildDefaultBaseUrl();

const buildAbsoluteUrl = (path: string, base: URL) => new URL(path, base).toString();

const resolveMetadataBase = () => {
  const headersList = headers();
  const forwardedProto = headersList.get('x-forwarded-proto');
  const forwardedHost = headersList.get('x-forwarded-host');
  const host = headersList.get('host');
  const finalHost = forwardedHost ?? host;
  const fallback = DEFAULT_BASE_URL;
  const protocol =
    forwardedProto ?? (finalHost && finalHost.includes('localhost') ? 'http' : 'https');

  if (finalHost) {
    try {
      return new URL(`${protocol}://${finalHost}`);
    } catch {
      return new URL(fallback);
    }
  }

  return new URL(fallback);
};

export function generateMetadata(): Metadata {
  const metadataBase = resolveMetadataBase();
  const dynamicOgImageUrl = buildAbsoluteUrl('/opengraph-image', metadataBase);
  const staticOgImageUrls = getOgImagePool().map((relativePath) =>
    buildAbsoluteUrl(toPublicPath(relativePath), metadataBase)
  );

  const sharedOpenGraphImageEntries = [
    {
      url: dynamicOgImageUrl,
      width: OG_IMAGE_DIMENSIONS.width,
      height: OG_IMAGE_DIMENSIONS.height,
      type: 'image/png',
    },
    ...staticOgImageUrls.map((url) => ({
      url,
      width: OG_IMAGE_DIMENSIONS.width,
      height: OG_IMAGE_DIMENSIONS.height,
      type: 'image/png',
    })),
  ];

  return {
    metadataBase,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    openGraph: {
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      type: 'website',
      images: sharedOpenGraphImageEntries,
    },
    twitter: {
      card: 'summary_large_image',
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [dynamicOgImageUrl, ...staticOgImageUrls],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: 'IsoCity',
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f1219',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${playfair.variable} ${dmSans.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/assets/buildings/residential.png" />
      </head>
      <body className="bg-background text-foreground antialiased font-sans overflow-hidden">{children}</body>
    </html>
  );
}
