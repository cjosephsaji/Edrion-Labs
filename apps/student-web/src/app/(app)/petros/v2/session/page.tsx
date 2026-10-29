import { Outfit } from 'next/font/google';
import { PetrosSessionDispatch } from '@/features/petros-v2/petros-session-dispatch';
import styles from './outfit-preview.module.css';

const outfit = Outfit({
  subsets: ['latin'],
  weight: 'variable',
  variable: '--font-petros-outfit-face',
  display: 'swap',
  preload: true,
  fallback: ['Arial', 'sans-serif'],
});

export default function PetrosV2SessionPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  return (
    <div className={`${outfit.variable} ${styles.preview}`}>
      <PetrosSessionDispatch sessionId={searchParams.session} />
    </div>
  );
}
