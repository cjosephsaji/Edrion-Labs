import type { Metadata } from 'next';
import { Newsreader, Source_Sans_3 } from 'next/font/google';
import { Providers } from './providers';
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
  adjustFontFallback: true,
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

export const metadata: Metadata = {
  title: 'Student Portal · Edrion',
  description: 'Your academic life — timetable, assignments, fees, and results.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${sourceSans.variable}`}
      data-student-theme="standard"
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
