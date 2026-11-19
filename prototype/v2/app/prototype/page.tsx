import { headers } from 'next/headers';
import { identity, previewAccount, accessReady } from '../../server/access';
import { LiveTeachingSurface } from '../../components/LiveTeachingSurface';
import { prototypeFeatures } from '../../core/prototype-features';
import { PreviewLogin } from '../../components/PreviewLogin';
import { isStageTopic } from '../../stage/navigation';
import { LearningStudio } from '../../components/LearningStudio';
import { LearningHome } from '../../components/LearningHome';
import { MakerStudio } from '../../components/MakerStudio';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    retry?: string;
    view?: string;
    mode?: string;
    lesson?: string;
    lab?: string;
  }>;
}) {
  const query = await searchParams;
  const stage = query.view === 'stage';
  const user = identity(new Headers(await headers()));
  if (user && (stage || query.view === 'world' || query.view === '3d'))
    return <MakerStudio canSignOut={user !== 'local-development'} />;
  // The entrance is goal-led. Existing lesson/view deep links remain available.
  if (user && !query.view && query.mode !== 'explore')
    return <LearningHome canSignOut={user !== 'local-development'} />;
  if (user && query.mode !== 'explore')
    return (
      <LearningStudio
        key={query.lesson ?? 'saved'}
        initialTopic={isStageTopic(query.lesson) ? query.lesson : undefined}
        canSignOut={user !== 'local-development'}
      />
    );
  if (user)
    return (
      <LiveTeachingSurface
        stageLesson={isStageTopic(query.lesson) ? query.lesson : 'neural'}
        canSignOut={user !== 'local-development'}
        presentation="2d"
      />
    );
  const redisReady =
    process.env.NODE_ENV !== 'production' ||
    !!(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    );
  return (
    <PreviewLogin
      account={previewAccount().requested}
      ready={accessReady() && redisReady}
      retry={query.retry}
      aiPaused={!prototypeFeatures.liveAI}
    />
  );
}
