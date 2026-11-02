import type { ReactNode } from 'react';
export const metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'Petros · A question worth exploring',
  description: 'Learn through experiments with Petros.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
