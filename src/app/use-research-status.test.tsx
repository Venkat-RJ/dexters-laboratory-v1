import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useResearchStatus } from "./use-research-status";
import { readResearchFile, isCurrentMapReview } from "../agent/mind-map-review";
import { notifyInfo, notifyWarning } from "../telemetry/app-notify";
import { dismissAppToastByDedupeKey } from "../telemetry/app-log-store";
import { invoke } from "@tauri-apps/api/core";
vi.mock('@lingui/react/macro',()=>({useLingui:()=>({t:translate})}));
const translate=(parts:TemplateStringsArray,...values:unknown[])=>parts.reduce((s,p,i)=>s+p+(values[i]??''),'');
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn().mockResolvedValue({})}));
vi.mock('../telemetry/app-notify',()=>({notifyInfo:vi.fn(),notifyWarning:vi.fn()}));
vi.mock('../telemetry/app-log-store',()=>({dismissAppToastByDedupeKey:vi.fn()}));
vi.mock('../agent/mind-map-review',async original=>({...await original<typeof import('../agent/mind-map-review')>(),readResearchFile:vi.fn(),isCurrentMapReview:vi.fn()}));
const state={version:1,stage:'prior-knowledge',status:'running',updatedAt:"2026-11-16T12:00:00Z",detail:'Comparing methods',pass:2,completedPasses:1};
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));vi.mocked(readResearchFile).mockResolvedValue(JSON.stringify(state));});
afterEach(()=>vi.useRealTimers());
const flush=async()=>{await act(async()=>{await vi.advanceTimersByTimeAsync(1);});};
it('updates one toast and does not repeat unchanged status',async()=>{
 const h=renderHook(()=>useResearchStatus('/p'));await flush();
 expect(notifyInfo).toHaveBeenCalledTimes(1);
 expect(vi.mocked(notifyInfo).mock.calls[0][2]?.detail).toContain('Pass 2 of at least 3');
 await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});expect(notifyInfo).toHaveBeenCalledTimes(1);
 h.unmount();expect(dismissAppToastByDedupeKey).toHaveBeenCalledWith('research-status:/p');
});
it('does not show old project reads after switching',async()=>{
 let resolve!:(s:string)=>void;vi.mocked(readResearchFile).mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
 const h=renderHook(({root})=>useResearchStatus(root),{initialProps:{root:'/a'}});h.rerender({root:'/b'});await flush();
 await act(async()=>resolve(JSON.stringify({...state,detail:'OLD'})));
 expect(vi.mocked(notifyInfo).mock.calls.every(c=>!c[2]?.detail?.includes('OLD'))).toBe(true);h.unmount();
});
it('reports review progress without launching a provider or writing a verdict',async()=>{
 const s={...state,stage:'mind-map-review',completedPasses:3,reviewRequestId:'r1'};
 vi.mocked(readResearchFile).mockImplementation(async(_,path)=>path==='research-state.json'?JSON.stringify(s):null);
 const h=renderHook(()=>useResearchStatus('/p'));await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(4000);});
 expect(invoke).not.toHaveBeenCalled();
 expect(notifyInfo).toHaveBeenCalledWith('Research status','Reviewing the mind map',expect.anything());h.unmount();
});
it('labels a current subagent review explicitly',async()=>{
 const s={...state,stage:'ready',status:'complete',completedPasses:3,reviewRequestId:'r1'};
 vi.mocked(readResearchFile).mockImplementation(async(_,path)=>JSON.stringify(path==='research-state.json'?s:{reviewer:'subagent',verdict:'pass'}));
 vi.mocked(isCurrentMapReview).mockResolvedValue(true);
 const h=renderHook(()=>useResearchStatus('/p'));await flush();
 expect(notifyInfo).toHaveBeenCalledWith('Research status','Mind map ready (subagent reviewed)',expect.anything());h.unmount();
});
it('does not label a stale passing review ready',async()=>{
 const s={...state,stage:'ready',status:'complete',completedPasses:3,reviewRequestId:'r1'};
 vi.mocked(readResearchFile).mockImplementation(async(_,p)=>JSON.stringify(p==='research-state.json'?s:{requestId:'r1',verdict:'pass',fingerprint:'old'}));
 vi.mocked(isCurrentMapReview).mockResolvedValue(false);
 const h=renderHook(()=>useResearchStatus('/p'));await flush();expect(notifyWarning).toHaveBeenCalledWith('Research status','Mind map needs review',expect.anything());h.unmount();
});

it('distinguishes unavailable reviewers from scientific revision findings',async()=>{
 const s={...state,stage:'mind-map-review',status:'blocked',completedPasses:3,reviewRequestId:'r1'};
 vi.mocked(readResearchFile).mockImplementation(async(_,p)=>JSON.stringify(p==='research-state.json'?s:{requestId:'r1',verdict:'error',summary:'Account unavailable'}));
 const h=renderHook(()=>useResearchStatus('/p'));await flush();
 expect(notifyWarning).toHaveBeenCalledWith('Research status','Research needs attention',expect.objectContaining({detail:'Account unavailable'}));
 expect(invoke).not.toHaveBeenCalled();h.unmount();
});

it('does not describe completed experiments as currently running',async()=>{
 vi.mocked(readResearchFile).mockResolvedValue(JSON.stringify({...state,stage:'experiments',status:'complete',detail:'All attempts closed'}));
 const h=renderHook(()=>useResearchStatus('/p'));await flush();
 expect(notifyInfo).toHaveBeenCalledWith('Research status','Research stage complete',expect.objectContaining({detail:expect.stringContaining('All attempts closed')}));h.unmount();
});

it('exposes current activity and clears paused or stale reports', async () => {
 const h = renderHook(() => useResearchStatus('/p'));
 await flush();
 expect(h.result.current?.stage).toBe('prior-knowledge');
 for (const stage of ['mind-map', 'experiments']) {
   vi.mocked(readResearchFile).mockResolvedValue(JSON.stringify({...state, stage}));
   await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
   expect(h.result.current?.stage).toBe(stage);
 }
 vi.mocked(readResearchFile).mockResolvedValue(JSON.stringify({...state, status:'paused'}));
 await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
 expect(h.result.current).toBeNull();
 vi.mocked(readResearchFile).mockResolvedValue(JSON.stringify({...state, updatedAt:'2026-11-16T11:54:00Z'}));
 await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
 expect(h.result.current).toBeNull();
 h.unmount();
});

it('keeps a paused review paused even when its receipt passes',async()=>{
 const s={...state,stage:'mind-map-review',status:'paused',completedPasses:3,reviewRequestId:'r1'};
 vi.mocked(readResearchFile).mockImplementation(async(_,path)=>JSON.stringify(path==='research-state.json'?s:{reviewer:'subagent',verdict:'pass'}));
 const h=renderHook(()=>useResearchStatus('/p'));await flush();
 expect(notifyInfo).toHaveBeenCalledWith('Research status','Research paused',expect.anything());h.unmount();
});
