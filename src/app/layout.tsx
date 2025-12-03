import type { Metadata, Viewport } from 'next';
import { Playfair_Display, DM_Sans } from 'next/font/google';
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

// Get the base URL for metadata - prioritize production URL
const getBaseUrl = () => {
  // Use NEXT_PUBLIC_SITE_URL if set (for production)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  // Use VERCEL_URL for Vercel deployments (preview/production)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback to localhost for development
  return 'http://localhost:3000';
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: 'ISOCITY — Metropolis Builder',
  description: 'A richly detailed isometric city builder. Build your metropolis and manage resources with cars, planes, helicopters, boats, trains, citizens, and more.',
  openGraph: {
    title: 'ISOCITY — Metropolis Builder',
    description: 'A richly detailed isometric city builder. Build your metropolis and manage resources with cars, planes, helicopters, boats, trains, citizens, and more.',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1179,
        height: 1406,
        type: 'image/png',
        alt: 'ISOCITY — Metropolis Builder',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ISOCITY — Metropolis Builder',
    description: 'A richly detailed isometric city builder. Build your metropolis and manage resources with cars, planes, helicopters, boats, trains, citizens, and more.',
    images: [
      {
        url: '/og-image.png',
        width: 1179,
        height: 1406,
        alt: 'ISOCITY — Metropolis Builder',
      },
    ],
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
