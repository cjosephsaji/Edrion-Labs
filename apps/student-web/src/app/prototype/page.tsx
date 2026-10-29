import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Outfit } from 'next/font/google';
import { Showcase } from '../../../../../prototype/components/showcase';
import { showcaseAccess } from '../../../../../prototype/teaching/access';
const outfit = Outfit({
  subsets: ['latin'],
  weight: 'variable',
  display: 'swap',
});
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Petros Showcase · Edrion',
  robots: { index: false, follow: false },
};
export default function Page() {
  if (process.env.PETROS_SHOWCASE_ENABLED !== '1') notFound();
  return <AuthorizedShowcase />;
}

async function AuthorizedShowcase() {
  if (!(await showcaseAccess(new Headers(headers())))) notFound();
  return (
    <div className={outfit.className}>
      <Showcase />
    </div>
  );
}
