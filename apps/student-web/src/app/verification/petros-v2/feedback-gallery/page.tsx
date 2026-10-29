import { notFound } from 'next/navigation';
import { FeedbackGallery, FeedbackGalleryState, LongReaderFixture } from '@/features/petros-v2/feedback-gallery';
import { galleryStates } from '@/features/petros-v2/feedback-fixtures';
export const dynamic = 'force-dynamic';
export default function Page({ searchParams }: { searchParams: { state?: string; reader?: string } }) {
  if (process.env.PETROS_ISOLATED_VERIFICATION !== '1' || process.env.NEXT_PUBLIC_PETROS_M4_DEMO !== '1') notFound();
  if (searchParams.reader === 'long') return <LongReaderFixture />;
  const state = galleryStates.find(state => state === searchParams.state);
  return state ? <FeedbackGalleryState state={state} /> : <FeedbackGallery />;
}
