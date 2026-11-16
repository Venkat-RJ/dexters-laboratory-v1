import { invoke } from "@tauri-apps/api/core";
import { useEffect, useReducer } from "react";
import { toMessage } from "../../app-utils";

export type ExperimentView = "active" | "all" | "attention";
export type ExperimentSort = "updated" | "experiment" | "score";
export type ScoreOutcome = "improved" | "neutral" | "worse" | "failed";
export type ExperimentStatus = "planned" | "queued" | "running" | "completed" | "failed"
  | "timed_out" | "interrupted" | "stale" | "unavailable";

export type ExperimentQuery = {
  view: ExperimentView;
  sort: ExperimentSort;
  search: string;
  gitCommit?: string;
  nodeId?: string;
  descendantNodeIds?: string[];
  relatedTo?: string;
  scoreOutcome?: ScoreOutcome;
  offset: number;
  limit: number;
};

type Metric = { name: string; value: number; baseline: number; unit?: string };

type ExperimentRow = {
  validation?: string | null;
  id: string;
  nodeId: string;
  title: string;
  retryOf: string | null;
  status: ExperimentStatus;
  totalCases: number | null;
  completedCases: number | null;
  updatedAt: number | null;
  metric: Metric | null;
  outcome: string | null;
  scoreOutcome?: ScoreOutcome | null;
  evaluation?: string | null;
  gitCommit?: string | null;
};

type ExperimentPage = {
  counts: Record<ExperimentView, number>;
  total: number;
  offset: number;
  rows: ExperimentRow[];
};

export type ExperimentBranchSummary = {
  total: number;
  run: Pick<ExperimentRow, "id" | "status" | "completedCases" | "totalCases">;
  best?: { id: string; metric: Metric; outcome: ScoreOutcome | null } | null;
  score: { id: string; metric: Metric; outcome: ScoreOutcome | null } | null;
};

export function useExperimentQuery(root: string, query: ExperimentQuery, enabled = true) {
  const result = useTrackerResult<ExperimentPage>(root, "query_experiments", "query", query, enabled);
  return result && { page: result.value, error: result.error };
}

export function useExperimentBranchSummaries(root: string, topics: [string, number][]) {
  return useTrackerResult<Record<string, ExperimentBranchSummary>>(
    root, "experiment_branch_summaries", "topics", topics, topics.length > 0,
  );
}

export function useTrackerResult<Value>(root: string, command: string, parameter: string, input: object, enabled: boolean) {
  type Result = { root: string; input: object; value?: Value; error?: string; signature?: string };
  const [result, publish] = useReducer((current: Result | undefined, next: Result) => (
    current?.root === next.root && current.input === next.input
      && current.signature === next.signature && current.error === next.error ? current : next
  ), undefined);
  useEffect(() => {
    if (!root || !enabled) return;
    let disposed = false;
    let pending = false;
    function refresh() {
      if (pending) return;
      pending = true;
      void invoke<Value>(command, { projectRoot: root, [parameter]: input }).then(
        (value) => { if (!disposed) publish({ root, input, value, signature: JSON.stringify(value) }); },
        (error: unknown) => { if (!disposed) publish({ root, input, error: toMessage(error) }); },
      ).finally(() => { pending = false; });
    }
    refresh();
    // The native index checks only changed files. This refresh also moves stale runs into Needs attention.
    const timer = window.setInterval(refresh, 1500);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [root, command, parameter, input, enabled]);
  return enabled && result?.root === root && result.input === input ? result : undefined;
}
