import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PetrosArtifactLibrary } from './petros-artifact-library';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('@/lib/api-client',()=>({useStudentApi:()=>api,newIdempotencyKey:()=>crypto.randomUUID(),formatApiError:(error:Error)=>error.message}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('retries an unconfirmed review with the same identity and unchanged payload',async()=>{
  const artifact={id:'artifact',revision:1,content:{kind:'flashcard',title:'Apex',front:'Which component?',back:'Vertical',tags:[]},
    sources:[],dueAt:'2026-09-25T00:00:00.000Z'};
  api.get.mockImplementation(async(path:string)=>path.includes('/review/due')
    ? {cards:[{artifact,topic:'Components',dueAt:artifact.dueAt,scheduleExplanation:'Scheduled review.'}],mixingExplanation:'Review cards.'}
    : [artifact]);
  api.post.mockRejectedValueOnce(new Error('Response lost.')).mockResolvedValueOnce({nextDueAt:'2026-09-26T00:00:00.000Z',scheduleExplanation:'Review recorded.'});
  render(<PetrosArtifactLibrary/>);
  fireEvent.click(await screen.findByRole('button',{name:'Reveal answer'}));
  fireEvent.click(screen.getByRole('radio',{name:'sure'}));
  fireEvent.click(screen.getByRole('button',{name:'Good'}));
  await screen.findByText('Response lost.');
  expect(screen.getByRole('button',{name:'Easy'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Retry Good'}));
  await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
  await screen.findByText(/Review recorded\. Next due/);
});
