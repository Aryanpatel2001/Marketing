import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Marketing Platform - Multi-Channel Marketing Automation',
    template: '%s | Marketing Platform',
  },
  description:
    'Powerful multi-channel marketing automation platform. Create and manage Email, SMS, and WhatsApp campaigns from a single dashboard.',
  keywords: [
    'email marketing',
    'SMS marketing',
    'WhatsApp marketing',
    'marketing automation',
    'campaign management',
    'email campaigns',
    'marketing platform',
  ],
  authors: [{ name: 'Marketing Platform' }],
  creator: 'Marketing Platform',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    title: 'Marketing Platform - Multi-Channel Marketing Automation',
    description:
      'Powerful multi-channel marketing automation platform. Create and manage Email, SMS, and WhatsApp campaigns from a single dashboard.',
    siteName: 'Marketing Platform',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Marketing Platform - Multi-Channel Marketing Automation',
    description:
      'Powerful multi-channel marketing automation platform. Create and manage Email, SMS, and WhatsApp campaigns from a single dashboard.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
