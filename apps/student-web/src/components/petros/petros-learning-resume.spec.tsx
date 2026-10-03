import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PetrosLearningResume } from './petros-learning-resume';
const api=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/lib/api-client',()=>({useStudentApi:()=>api,formatApiError:(error:Error)=>error.message}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const available={status:'available',objectiveStatement:'Distinguish velocity components.',objective:{id:'objective',version:2},
  pack:{id:'pack',version:3},currentEvidence:{observedResponses:4,demonstratedApplications:1,
    assistedResponses:2,uncertainResponses:1,declaredExternalAssistanceResponses:1}};
describe('current artifact learning context',()=>{
  it('loads on request and keeps coverage, assistance, applications and reported recall distinct',async()=>{
    api.get.mockResolvedValue(available);render(<PetrosLearningResume artifactId="artifact" revision={1}/>);
    expect(api.get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(available.objectiveStatement)).toBeVisible();
    expect(screen.getByText(/4 recorded responses · 1 demonstrated applications/)).toBeVisible();
    expect(screen.getByText(/Other external help is unknown/)).toBeVisible();
    expect(screen.getByText(/Card reviews record your reported recall/)).toBeVisible();
    expect(api.get).toHaveBeenCalledWith('/student/petros/artifacts/artifact/learning-resume');
  });
  it('does not manufacture an objective for legacy artifacts',async()=>{
    api.get.mockResolvedValue({status:'legacy'});render(<PetrosLearningResume artifactId="legacy" revision={1}/>);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/No reviewed objective evidence/)).toBeVisible();
  });
  it('clears previously visible evidence when current authority fails',async()=>{
    api.get.mockResolvedValueOnce(available).mockRejectedValueOnce(new Error('Source changed.'));
    render(<PetrosLearningResume artifactId="artifact" revision={1}/>);fireEvent.click(screen.getByRole('button'));
    await screen.findByText(available.objectiveStatement);fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/Source changed/)).toBeVisible();
    expect(screen.queryByText(available.objectiveStatement)).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Retry learning context'})).toBeEnabled();
  });
  it('discards a response for an earlier artifact revision',async()=>{
    let resolve!:(value:unknown)=>void;api.get.mockReturnValue(new Promise(done=>{resolve=done;}));
    const view=render(<PetrosLearningResume artifactId="artifact" revision={1}/>);fireEvent.click(screen.getByRole('button'));
    view.rerender(<PetrosLearningResume artifactId="artifact" revision={2}/>);resolve(available);
    await Promise.resolve();expect(screen.queryByText(available.objectiveStatement)).not.toBeInTheDocument();
  });
});
