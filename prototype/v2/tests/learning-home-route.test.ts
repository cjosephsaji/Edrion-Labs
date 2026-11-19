import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from '../app/prototype/page';
import { LearningHome } from '../components/LearningHome';
import { LearningStudio } from '../components/LearningStudio';
import { LiveTeachingSurface } from '../components/LiveTeachingSurface';
import { PreviewLogin } from '../components/PreviewLogin';
import { MakerStudio } from '../components/MakerStudio';

const access = vi.hoisted(() => ({
  user: 'local-development' as string | null,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('../server/access', () => ({
  identity: () => access.user,
  previewAccount: () => ({ requested: false }),
  accessReady: () => true,
}));
vi.mock('../components/LearningStudio', () => ({ LearningStudio: () => null }));
vi.mock('../components/MakerStudio', () => ({ MakerStudio: () => null }));
vi.mock('../components/LiveTeachingSurface', () => ({
  LiveTeachingSurface: () => null,
}));
vi.mock('../components/PreviewLogin', () => ({ PreviewLogin: () => null }));
afterEach(() => {
  access.user = 'local-development';
  vi.unstubAllEnvs();
});

it('opens the learning home by default even if an old stage-default flag is set', async () => {
  vi.stubEnv('PETROS_V2_STAGE_DEFAULT', '1');
  const page = await Page({ searchParams: Promise.resolve({}) });
  expect(page.type).toBe(LearningHome);
});
it('routes spatial links into the independent laboratory and preserves the free lab', async () => {
  const guided = await Page({
    searchParams: Promise.resolve({ view: '2d', lesson: 'traffic' }),
  });
  expect(guided.type).toBe(LearningStudio);
  expect(guided.props.initialTopic).toBe('traffic');
  const invalid = await Page({
    searchParams: Promise.resolve({ view: '2d', lesson: 'unavailable' }),
  });
  expect(invalid.props.initialTopic).toBeUndefined();
  for (const view of ['stage', 'world', '3d'] as const) {
    const page = await Page({
      searchParams: Promise.resolve({ view, lesson: 'rocket' }),
    });
    expect(page.type).toBe(MakerStudio);
  }
  const free = await Page({
    searchParams: Promise.resolve({ view: '2d', mode: 'explore' }),
  });
  expect(free.type).toBe(LiveTeachingSurface);
  expect(free.props.presentation).toBe('2d');
});
it('keeps the entry behind existing authentication', async () => {
  access.user = null;
  expect((await Page({ searchParams: Promise.resolve({}) })).type).toBe(
    PreviewLogin,
  );
});
it('renders one primary learning link and an explicit outcome without a mode picker', () => {
  const html = renderToStaticMarkup(createElement(LearningHome));
  expect(html).toContain('It starts with');
  expect(html).toContain('YOUR FIRST SMALL WIN');
  expect(html).toContain('view=2d&amp;lesson=traffic');
  expect(html).not.toContain('view=world');
  expect(html).not.toContain('view=stage');
  expect(html).not.toContain('Sign out');
  expect(
    renderToStaticMarkup(createElement(LearningHome, { canSignOut: true })),
  ).toContain('/prototype/api/logout');
});
