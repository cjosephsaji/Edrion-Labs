import type { Metadata } from 'next';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-st-body-face',
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
  title: 'Register your institution · Edrion',
  description: 'Apply to bring your institution onto Edrion.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${jetBrainsMono.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
