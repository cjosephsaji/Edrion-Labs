import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Instrument_Sans, Source_Serif_4 } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { RegisterSW } from '@/components/register-sw';

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-ui',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Edrion Student',
  description: 'Your learning portal — practice, progress, and everything your school shares.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Edrion Student' },
};

export const viewport: Viewport = {
  themeColor: '#1E7A5E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full ${sourceSerif.variable} ${instrumentSans.variable} ${ibmPlexMono.variable}`}
      data-student-theme="standard"
    >
      <body className="h-full antialiased">
        <Providers>{children}</Providers>
        <RegisterSW />
      </body>
    </html>
  );
}
