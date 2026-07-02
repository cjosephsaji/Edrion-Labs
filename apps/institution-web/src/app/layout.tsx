import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Edrion Institution Portal',
  description: 'Run your institution — every campus, one portal.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Font stack is defined in design tokens (--font-sans) with system fallbacks; no network fetch.
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
