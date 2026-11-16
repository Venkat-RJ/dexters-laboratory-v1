/* eslint-disable lingui/no-unlocalized-strings -- Saved research review protocol. */
import { invoke } from "@tauri-apps/api/core";

export const RESEARCH_STATE_PATH = "research-state.json";
export type ResearchState = {
  version: 1; stage: string; status: "running" | "paused" | "blocked" | "complete" | "idle";
  updatedAt: string; detail: string; pass?: number; completedPasses: number;
  reviewRequestId?: string; evidencePaths?: string[];
};
const stages = new Set(["formulation", "search-plan", "prior-knowledge", "mind-map", "mind-map-review", "ready", "setup", "experiments", "analysis", "reporting", "scratchpad"]);
export function parseResearchState(raw: string): ResearchState {
  const s = JSON.parse(raw) as ResearchState;
  if (s.version !== 1 || !stages.has(s.stage) || !["running", "paused", "blocked", "complete", "idle"].includes(s.status)
    || !Number.isFinite(Date.parse(s.updatedAt)) || typeof s.detail !== "string" || s.detail.length > 500
    || !Number.isInteger(s.completedPasses) || s.completedPasses < 0
    || (s.pass !== undefined && (!Number.isInteger(s.pass) || s.pass < 1))
    || (s.reviewRequestId !== undefined && !/^[a-zA-Z0-9_-]{1,80}$/.test(s.reviewRequestId))
    || (s.evidencePaths !== undefined && (!Array.isArray(s.evidencePaths) || s.evidencePaths.length > 20 || !s.evidencePaths.every(safePath))))
    throw new Error("Invalid research-state.json. Check the research status contract.");
  return s;
}
function safePath(path: unknown): path is string {
  return typeof path === "string" && path.length < 300 && !/[:\\#]/.test(path)
    && path.split("/").every(p => p && p !== "." && p !== "..");
}
export async function readResearchFile(root: string, path: string): Promise<string | null> {
  const stat = await invoke<{exists: boolean}>("stat_project_file", {path});
  return stat.exists ? invoke<string>("read_project_file", {projectRoot: root, path}) : null;
}
const required = ["formulation.tex", "prior-knowledge.tex", "sources/search-plan.md", "sources/prior-knowledge.md", "mind-map.json"];
export async function reviewSnapshot(root: string, state: ResearchState) {
  const paths = [...new Set([...required, ...(state.evidencePaths ?? [])])];
  const artifacts = await Promise.all(paths.map(async path => {
    const content = await readResearchFile(root, path);
    if (content === null) throw new Error(`Missing review evidence: ${path}`);
    return {path, content};
  }));
  const serialized = JSON.stringify(artifacts);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  const fingerprint = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const topics = JSON.parse(artifacts.find(a => a.path === "mind-map.json")!.content).topics as {id: string}[];
  return {artifacts, fingerprint, topicIds: topics.map(t => t.id)};
}
export type MapReview = { requestId: string; fingerprint: string; verdict: "pass" | "revise" | "error" | "stale";
  summary: string; findings: {topicId: string; issue: string; correction: string}[]; coveredTopicIds: string[];
  completedPasses: number; reviewedAt: string; model?: string; reviewer?: "subagent"; reviewerId?: string };
export function validateReviewReply(text: string, ids: string[]) {
  const r = JSON.parse(text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as MapReview;
  if (!["pass", "revise"].includes(r.verdict) || typeof r.summary !== "string" || !r.summary.trim()
    || !Array.isArray(r.findings) || !r.findings.every(f => ids.includes(f.topicId) && typeof f.issue === "string" && typeof f.correction === "string")
    || !Array.isArray(r.coveredTopicIds) || ids.some(id => !r.coveredTopicIds.includes(id)) || r.coveredTopicIds.some(id => !ids.includes(id))
    || (r.verdict === "pass" && r.findings.length)) throw new Error("Review lacks full topic coverage or a consistent verdict.");
  return {verdict: r.verdict, summary: r.summary, findings: r.findings, coveredTopicIds: r.coveredTopicIds};
}
/** Validate recorded review evidence. A subagent in the existing research session performs the review. */
export async function isCurrentMapReview(root: string, state: ResearchState, report: MapReview | null): Promise<boolean> {
  if (!report || report.verdict !== "pass" || report.requestId !== state.reviewRequestId
    || state.completedPasses < 3 || !Number.isInteger(report.completedPasses) || report.completedPasses < 3
    || !Number.isFinite(Date.parse(report.reviewedAt))) return false;
  if (report.reviewer !== "subagent" || typeof report.reviewerId !== "string" || !report.reviewerId.trim()) return false;
  const snapshot = await reviewSnapshot(root, state);
  if (report.fingerprint !== snapshot.fingerprint) return false;
  try { validateReviewReply(JSON.stringify(report), snapshot.topicIds); return true; }
  catch { return false; }
}
