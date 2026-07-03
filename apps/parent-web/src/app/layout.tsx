import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/lib/query';
import { AppShell } from '@/components/AppShell';
import { RegisterSW } from '@/components/RegisterSW';

export const metadata: Metadata = {
  title: 'Edrion Parent',
  description: 'Everything about your child at school — attendance, results, fees, health and more.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Edrion Parent' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <RegisterSW />
      </body>
    </html>
  );
}
