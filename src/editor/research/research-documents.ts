import { isRecord } from "../../app-utils";

export const MIND_MAP_PATH = "mind-map.json";
export const EXPERIMENTS_PATH = "experiments.json";
export const EXPERIMENT_BRANCH_SELECTION = "experiment-branch";

export type MindMapTopic = {
  id: string;
  label: string;
  depth: number;
  role?: "evidence" | "hypothesis" | "test";
};

export type Experiment = {
  id: string;
  nodeId: string;
  title: string;
  hypothesis: string;
  baseline: string;
  success: string;
  plan: string;
  totalCases?: number;
  outcome?: string;
  retryOf?: string;
  queued?: boolean;
};

type CaseResult = {
  case: string;
  result: string;
  evidence?: string;
};

export type Run = {
  status: "running" | "completed" | "failed" | "timed_out" | "interrupted";
  elapsedSeconds: number;
  limitSeconds: number;
  updatedAt: number;
  completedCases: number;
  activeCase?: string;
  results: CaseResult[];
  exitCode?: number;
  gitCommit?: string;
};

function readDocument(source: string): unknown {
  try { return JSON.parse(source) as unknown; }
  catch { return null; }
}

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const recordId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function projectEvidencePath(value: string): string | null {
  return value.split("/").every((part) => part && part !== ".." && part !== ".")
    && !/[\\:]/.test(value)
    && !Array.from(value).some((character) => character.charCodeAt(0) < 32) ? value : null;
}

export function parseMindMap(source: string): MindMapTopic[] | null {
  const doc = readDocument(source);
  if (!isRecord(doc) || doc.version !== 1 || !Array.isArray(doc.topics)
    || !doc.topics.length || doc.topics.length > 4096) return null;
  const topics: MindMapTopic[] = [];
  const ids = new Set<string>();
  for (const [index, item] of doc.topics.entries()) {
    if (!isRecord(item) || !nonempty(item.id) || ids.has(item.id) || !nonempty(item.label)
      || typeof item.depth !== "number" || !Number.isInteger(item.depth) || item.depth > 32
      || (index === 0 ? item.depth !== 0 : item.depth < 1 || item.depth > topics[index - 1].depth + 1)) return null;
    if (item.role !== undefined && item.role !== "evidence" && item.role !== "hypothesis" && item.role !== "test") return null;
    topics.push({ id: item.id, label: item.label, depth: item.depth, role: item.role });
    ids.add(item.id);
  }
  return topics;
}

export function parseExperiments(source: string): Experiment[] | null {
  const doc = readDocument(source);
  if (!isRecord(doc) || doc.version !== 1 || !Array.isArray(doc.experiments)) return null;
  const experiments: Experiment[] = [];
  const ids = new Set<string>();
  for (const item of doc.experiments) {
    if (!isRecord(item) || !recordId(item.id) || ids.has(item.id) || !nonempty(item.nodeId) || !nonempty(item.title)
      || !nonempty(item.hypothesis) || !nonempty(item.baseline) || !nonempty(item.success)
      || !nonempty(item.plan) || !projectEvidencePath(item.plan)
      || (item.outcome !== undefined && typeof item.outcome !== "string")
      || (item.retryOf != null && !recordId(item.retryOf))
      || (item.queued !== undefined && typeof item.queued !== "boolean")
      || (item.totalCases !== undefined && (!nonnegative(item.totalCases) || !Number.isInteger(item.totalCases) || !item.totalCases))) return null;
    experiments.push({
      id: item.id, nodeId: item.nodeId, title: item.title, hypothesis: item.hypothesis, baseline: item.baseline,
      success: item.success, plan: item.plan, totalCases: item.totalCases, outcome: item.outcome,
      retryOf: item.retryOf ?? undefined, queued: item.queued,
    });
    ids.add(item.id);
  }
  return experiments;
}

export function parseRun(source: string): Run | null {
  const doc = readDocument(source);
  if (!isRecord(doc) || !nonnegative(doc.elapsedSeconds) || !nonnegative(doc.limitSeconds)
    || !nonnegative(doc.updatedAt) || !nonnegative(doc.completedCases) || !Array.isArray(doc.results)) return null;
  const { status } = doc;
  if (status !== "running" && status !== "completed" && status !== "failed"
    && status !== "timed_out" && status !== "interrupted") return null;
  const results: CaseResult[] = [];
  for (const item of doc.results) {
    if (!isRecord(item) || !nonempty(item.case) || !nonempty(item.result)) return null;
    results.push({ case: item.case, result: item.result, evidence: typeof item.evidence === "string" ? item.evidence : undefined });
  }
  return {
    status, elapsedSeconds: doc.elapsedSeconds, limitSeconds: doc.limitSeconds, updatedAt: doc.updatedAt,
    completedCases: doc.completedCases, activeCase: typeof doc.activeCase === "string" ? doc.activeCase : undefined,
    exitCode: typeof doc.exitCode === "number" ? doc.exitCode : undefined, results,
    gitCommit: typeof doc.gitCommit === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(doc.gitCommit) ? doc.gitCommit : undefined,
  };
}

export function parseLaunchFailure(source: string): { reason: string; exitCode?: number } | null {
  const doc = readDocument(source);
  if (!isRecord(doc) || doc.status !== "failed" || !nonempty(doc.reason)) return null;
  return { reason: doc.reason, exitCode: typeof doc.exitCode === "number" ? doc.exitCode : undefined };
}

export const runPath = (id: string) => `experiments/${id}/run-status.json`;
