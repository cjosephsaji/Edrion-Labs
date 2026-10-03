import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {PetrosDocumentStudy} from './petros-document-study';

const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('@/lib/api-client',()=>({useStudentApi:()=>api,formatApiError:(error:unknown)=>String(error)}));
vi.mock('@/lib/hooks',()=>({useStudentList:()=>({isPending:false,error:null,data:{items:[
  {id:'a',title:'Source A',kind:'pdf',pageCount:2,extractionReady:true},
  {id:'b',title:'Source B',kind:'pdf',pageCount:2,extractionReady:true},
]},refetch:vi.fn()})}));
vi.mock('./petros-door-button',()=>({PetrosDocumentDoor:()=>null}));
vi.mock('@edrion/ui',()=>({PetrosTeachingBlockPreview:()=> <p>Guided synthesis</p>}));

const comparison={comparisonId:'comparison',question:'Horizontal motion',status:'different_passages',uncertainty:'Correctness remains unverified',
  sources:[{sourceId:'a',sourceVersion:'version-a',title:'Source A',hits:[{spanId:'span-a',source:{text:'A separately cited claim',locator:{page:1,start:0,end:24,textSha256:'text-a'}}}],trace:{searchedPages:[1],totalPages:2}},
    {sourceId:'b',sourceVersion:'version-b',title:'Source B',hits:[{spanId:'span-b',source:{text:'A competing claim',locator:{page:1,start:0,end:17,textSha256:'text-b'}}}],trace:{searchedPages:[1],totalPages:2}}],studyPlan:{block:{id:'read-only'}}};

async function selectAndCompare(){
  render(<PetrosDocumentStudy/>);
  fireEvent.click(screen.getAllByRole('button',{name:'Select for comparison'})[0]!);
  await waitFor(()=>expect(screen.getByText('Compare selected sources · 1 of 3')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Select for comparison'}));
  await waitFor(()=>expect(screen.getByText('Compare selected sources · 2 of 3')).toBeInTheDocument());
  fireEvent.change(screen.getAllByRole('textbox',{name:'Pages (comma separated)'})[0]!,{target:{value:'1, 2'}});
  fireEvent.change(screen.getByRole('textbox',{name:'What do you want to compare?'}),{target:{value:'Horizontal motion'}});
  fireEvent.click(screen.getByRole('button',{name:'Compare source passages'}));
  await screen.findByRole('region',{name:'Source comparison results'});
}

beforeEach(()=>{
  api.get.mockImplementation(async(path:string)=>({sourceId:path.includes('/a/')?'a':'b',title:path.includes('/a/')?'Source A':'Source B',sourceVersion:path.includes('/a/')?'version-a':'version-b',pages:[1]}));
  api.post.mockResolvedValue(comparison);
});
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});

describe('explicit multi-source study',()=>{
  it('sends exactly the selected pins/pages and clears passages and private synthesis on backgrounding',async()=>{
    await selectAndCompare();
    expect(api.post).toHaveBeenCalledWith('/student/petros/documents/compare',expect.objectContaining({sources:[
      {sourceId:'a',sourceVersion:'version-a',pages:[1,2]},{sourceId:'b',sourceVersion:'version-b',pages:[1]}]}));
    expect(screen.getByText('A competing claim')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox',{name:'Your qualified synthesis · unsaved'}),{target:{value:'My private interpretation'}});
    act(()=>window.dispatchEvent(new Event('blur')));
    expect(screen.queryByText('A competing claim')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('My private interpretation')).not.toBeInTheDocument();
  });
  it('withdraws the whole displayed comparison when the next current-authority check fails',async()=>{
    let check: () => void = () => {throw new Error('No authority timer was registered');};
    vi.spyOn(window,'setInterval').mockImplementation(handler=>{check=handler as () => void;return 0 as unknown as ReturnType<typeof setInterval>;});
    await selectAndCompare();
    api.get.mockRejectedValue(new Error('Access withdrawn'));
    await act(async()=>{check();});
    expect(screen.queryByText('A separately cited claim')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Current access to a selected source is unavailable');
  });
});
