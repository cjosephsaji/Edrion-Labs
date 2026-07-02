import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Register your institution · Edrion',
  description: 'Apply to bring your institution onto Edrion.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Font stack is defined in design tokens (--font-sans) with system fallbacks, so no
  // network font fetch is required to build or run. The public funnel uses raw fetch, so no
  // query-client / api-client providers are needed here.
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
