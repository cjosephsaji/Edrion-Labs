import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Edrion Super Admin',
  description: 'Edrion internal control plane',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Font stack is defined in design tokens (--font-sans) with system fallbacks, so no
  // network font fetch is required to build or run.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
