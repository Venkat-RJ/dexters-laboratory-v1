import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { ResearchDocument } from './research-document';
import { ExperimentNoteHeader } from './experiments-view';
import { selectResearchItem } from './research-links';

const map = JSON.stringify({version:1,topics:[
  {id:'root',label:'Squares',depth:0},
  {id:'a',label:'Branch A',depth:1},
  {id:'child',label:'Child',depth:2},
  {id:'b',label:'Branch B',depth:1},
]});
const journal = JSON.stringify({version:1,experiments:[{
  id:'E-0743',nodeId:'a',title:'Best attempt',hypothesis:'Fit smaller',baseline:'5',success:'Below 5',plan:'plan.tex',
}]});
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn((command,args)=>{
  if(command==='experiment_chart_progress') return Promise.resolve([]);
  if(command==='experiment_branch_summaries') return Promise.resolve({});
  if(command==='read_project_file') {
    if(args.path === 'mind-map.json') return Promise.resolve(map);
    if(args.path === 'experiments.json') return Promise.resolve(journal);
    if(args.path.endsWith('charts.json')) return Promise.resolve('{"version":1,"charts":[]}');
    return Promise.reject(`${args.path} is not in the project folder.`);
  }
  if(command==='query_experiments') return Promise.resolve({counts:{all:0,active:0,attention:0},total:0,offset:0,rows:[]});
  return Promise.reject('Unexpected command');
})}));
vi.mock('../../project/project-files-changed',()=>({changesReach:()=>false,onProjectFilesChanged:()=>()=>{}}));
afterEach(cleanup);
const document = (root: string, path = 'experiments.json', openFile = vi.fn()) =>
  <ResearchDocument root={root} path={path} source={path==='mind-map.json'?map:journal} openFile={openFile} sourceEditor={<p>Source editor</p>}/>;

it('opens the linked map node after Charts, including repeated links to the same node',async()=>{
  const root='/review-map';
  render(document(root,'mind-map.json'));
  for(let n=0;n<2;n++) {
    fireEvent.click(screen.getByRole('button',{name:'Charts'}));
    await act(async()=>selectResearchItem({root,path:'mind-map.json',id:'b'}));
    expect(within(screen.getByRole('navigation',{name:'Mind map path'})).getByText('Branch B')).toHaveAttribute('aria-current','location');
  }
});
it('shows overall Charts without filters and preserves the tracker branch',async()=>{
  const root='/review-scope';
  selectResearchItem({root,path:'experiment-branch',id:'a'});
  render(document(root));
  await waitFor(()=>expect(screen.getByRole('combobox',{name:'Research branch'})).toHaveValue('a'));
  fireEvent.click(screen.getByRole('button',{name:'Charts'}));
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Design of Experiments'}));
  expect(screen.getByRole('combobox',{name:'Research branch'})).toHaveValue('a');
});
it('opens requested runs and experiment details when the tracker was left on Charts',async()=>{
  const root='/review-runs';
  render(document(root));
  fireEvent.click(screen.getByRole('button',{name:'Charts'}));
  await act(async()=>selectResearchItem({root,path:'experiment-branch',id:'b'}));
  expect(screen.getByRole('heading',{name:'Design of Experiments'})).toBeVisible();
  expect(screen.getByRole('combobox',{name:'Research branch'})).toHaveValue('b');
  fireEvent.click(screen.getByRole('button',{name:'Charts'}));
  await act(async()=>selectResearchItem({root,path:'experiments.json',id:'E-0743'}));
  expect(screen.getByRole('heading',{name:'Best attempt'})).toBeVisible();
});
it('shows the source editor when requested from Charts',async()=>{
  render(document('/review-source'));
  fireEvent.click(screen.getByRole('button',{name:'Charts'}));
  fireEvent.click(screen.getByRole('button',{name:'Show source'}));
  expect(screen.getByText('Source editor')).toBeVisible();
});
it('keeps notes free of per-run charts and returns to the tracker from Charts',async()=>{
  const root='/review-note';
  const openFile=vi.fn();
  render(<>{document(root)}<ExperimentNoteHeader root={root} id='E-0743' openFile={openFile}/></>);
  await screen.findByRole('region',{name:'Run progress'});
  fireEvent.click(screen.getByRole('button',{name:'Charts'}));
  expect(screen.queryByText('Chart definitions')).not.toBeInTheDocument();
  expect(vi.mocked(invoke).mock.calls.some(([cmd,args])=>cmd==='read_project_file' && (args as {path:string}).path.endsWith('charts.json'))).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'All experiments'}));
  expect(screen.getByRole('heading',{name:'Design of Experiments'})).toBeVisible();
  expect(screen.getByRole('button',{name:/^All(?! experiments)/})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('combobox',{name:'Research branch'})).toHaveValue('');
});

it('loads the tracker when WebKit reports a hidden document', async () => {
  const visibility = vi.spyOn(globalThis.document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    render(document('/hidden-window'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('query_experiments', expect.objectContaining({projectRoot:'/hidden-window'})));
    await waitFor(() => expect(screen.queryByText('Loading experiments…')).not.toBeInTheDocument());
  } finally { visibility.mockRestore(); }
});
