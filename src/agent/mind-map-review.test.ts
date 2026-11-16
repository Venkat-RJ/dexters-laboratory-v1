import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { parseResearchState, reviewSnapshot, isCurrentMapReview, validateReviewReply, type ResearchState, type MapReview } from "./mind-map-review";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const state: ResearchState = {version:1, stage:"ready", status:"complete", updatedAt:"2026-11-16T12:00:00Z", detail:"Review", completedPasses:3, reviewRequestId:"r1"};
const pass: MapReview = {requestId:'r1',reviewer:'subagent',reviewerId:'child-123',fingerprint:'',completedPasses:3,reviewedAt:state.updatedAt,verdict:"pass",summary:"Covered",coveredTopicIds:["root","geometry"],findings:[]};
let files: Record<string,string>;
beforeEach(() => {
  vi.resetAllMocks();
  files = {"formulation.tex":"Question", "prior-knowledge.tex":"Synthesis", "sources/search-plan.md":"Three passes", "sources/prior-knowledge.md":"Sources",
    "mind-map.json":JSON.stringify({topics:[{id:"root",depth:0},{id:"geometry",depth:1}]})};
  vi.mocked(invoke).mockImplementation(async (cmd,args) => {
    const {path} = args as {path:string};
    if (cmd === "stat_project_file") return {exists:path in files};
    if (cmd === "read_project_file") return files[path];
    throw new Error(cmd);
  });
});
const receipt = async () => ({...pass,fingerprint:(await reviewSnapshot('/p',state)).fingerprint});
describe("recorded subagent map review", () => {
  it("accepts a complete review bound to saved evidence and preserves scratchpad independence", async () => {
    const report=await receipt();
    expect(await isCurrentMapReview('/p',state,report)).toBe(true);
    files['scratchpad.tex']='A speculative idea';
    expect(await isCurrentMapReview('/p',state,report)).toBe(true);
    expect(parseResearchState(JSON.stringify({...state,stage:'scratchpad'})).stage).toBe('scratchpad');
  });
  it("requires three passes and a real reviewer identity", async () => {
    const report=await receipt();
    expect(await isCurrentMapReview('/p',{...state,completedPasses:2},report)).toBe(false);
    expect(await isCurrentMapReview('/p',state,{...report,reviewerId:''})).toBe(false);
    expect(await isCurrentMapReview('/p',state,{...report,reviewer:undefined})).toBe(false);
  });
  it("rejects omitted topics and passing verdicts with unresolved findings", async () => {
    const report=await receipt();
    expect(await isCurrentMapReview('/p',state,{...report,coveredTopicIds:['root']})).toBe(false);
    expect(()=>validateReviewReply(JSON.stringify({...report,findings:[{topicId:'root',issue:'Missing',correction:'Add'}]}),['root','geometry'])).toThrow();
  });
  it("invalidates a receipt after evidence changes", async () => {
    const report=await receipt();files['prior-knowledge.tex']='New claim';
    expect(await isCurrentMapReview('/p',state,report)).toBe(false);
  });
  it("does not omit missing evidence or reject larger evidence for a removed provider limit", async () => {
    await expect(reviewSnapshot('/p',{...state,evidencePaths:['sources/missing.md']})).rejects.toThrow('Missing review evidence');
    files['sources/primary.md']='e'.repeat(125_000);
    expect((await reviewSnapshot('/p',{...state,evidencePaths:['sources/primary.md']})).artifacts).toHaveLength(6);
  });
  it("matches the agent helper for Unicode, CRLF and a 1000-topic map", async () => {
    files['prior-knowledge.tex']='Evidence α and 中文\r\nNext line';
    files['mind-map.json']=JSON.stringify({topics:Array.from({length:1000},(_,i)=>({id:'n'+i,depth:i?1:0}))});
    const root=mkdtempSync(join(tmpdir(),'lattice-review-'));
    try {
      for (const [name,text] of Object.entries({...files,'research-state.json':JSON.stringify(state)})) {
        const path=join(root,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);
      }
      const result=JSON.parse(execFileSync('python3',['src-tauri/src/embedded_skills/research-mind-map/scripts/review_snapshot.py',root],{encoding:'utf8'}));
      const expected=await reviewSnapshot('/p',state);
      expect(result.fingerprint).toBe(expected.fingerprint);expect(result.topicIds).toEqual(expected.topicIds);
      expect(result).not.toHaveProperty('verdict');
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  it("rejects unsafe paths and IDs", () => {
    expect(()=>parseResearchState(JSON.stringify({...state,evidencePaths:['../private']}))).toThrow();
    expect(()=>parseResearchState(JSON.stringify({...state,reviewRequestId:'../r'}))).toThrow();
  });
});
