import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Manrope } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-st-body-face',
  display: 'swap',
  preload: true,
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: true,
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-st-display-face',
  display: 'swap',
  preload: true,
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: true,
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-st-mono-face',
  display: 'swap',
  preload: true,
  fallback: ['SFMono-Regular', 'monospace'],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: 'Edrion Institution Portal',
  description: 'Run your institution — every campus, one portal.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`h-full ${inter.variable} ${manrope.variable} ${jetBrainsMono.variable}`}
    >
      <body className="h-full font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
