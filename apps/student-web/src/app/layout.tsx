import type { Metadata } from 'next';
import { Newsreader, Source_Sans_3, Space_Grotesk } from 'next/font/google';
import { Providers } from './providers';
import 'katex/dist/katex.min.css';
import './globals.css';

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-st-display-face',
  display: 'swap',
  preload: true,
  fallback: ['Georgia', 'serif'],
  // Next.js has no fallback-metric table for Newsreader, so asking it to
  // calculate overrides only produces a noisy build warning.
  adjustFontFallback: false,
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  variable: '--font-st-body-face',
  display: 'swap',
  preload: true,
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: true,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-petros-display-face',
  display: 'swap',
  preload: true,
  fallback: ['Arial', 'sans-serif'],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: 'Student Portal · Edrion',
  description: 'Your academic life — timetable, assignments, fees, and results.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${sourceSans.variable} ${spaceGrotesk.variable}`}
      data-student-theme="standard"
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
