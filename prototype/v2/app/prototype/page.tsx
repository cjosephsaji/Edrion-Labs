import { headers } from 'next/headers';
import { identity, previewAccount, accessReady } from '../../server/access';
import { LiveTeachingSurface } from '../../components/LiveTeachingSurface';
import { prototypeFeatures } from '../../core/prototype-features';
import { PreviewLogin } from '../../components/PreviewLogin';
import { isStageTopic } from '../../stage/navigation';
import { LearningStudio } from '../../components/LearningStudio';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    retry?: string;
    view?: string;
    mode?: string;
    lesson?: string;
  }>;
}) {
  const query = await searchParams;
  const stage =
    query.view === 'stage' ||
    (!query.view && process.env.PETROS_V2_STAGE_DEFAULT === '1');
  const user = identity(new Headers(await headers()));
  if (
    user &&
    !stage &&
    (!prototypeFeatures.world || query.view === '2d') &&
    query.mode !== 'explore'
  )
    return <LearningStudio canSignOut={user !== 'local-development'} />;
  if (user)
    return (
      <LiveTeachingSurface
        stageLesson={isStageTopic(query.lesson) ? query.lesson : 'neural'}
        canSignOut={user !== 'local-development'}
        presentation={
          stage
            ? 'stage'
            : prototypeFeatures.world && query.view !== '2d'
              ? 'world'
              : '2d'
        }
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
