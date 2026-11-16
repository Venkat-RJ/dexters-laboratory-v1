import { useEffect, useReducer } from "react";
import { useLingui } from "@lingui/react/macro";
import { notifyInfo, notifyWarning } from "../telemetry/app-notify";
import { dismissAppToastByDedupeKey } from "../telemetry/app-log-store";
import { parseResearchState, readResearchFile, isCurrentMapReview, RESEARCH_STATE_PATH, type MapReview } from "../agent/mind-map-review";

type StatusCopy = {
  subagentReviewed: string; complete: string; status: string; paused: string; stopped: string; idle: string; blocked: string;
  needsReview: string; noPass: string; passed: string; revise: string; outdated: string;
  unavailable: string; pass: (n: number) => string; reported: (time: string) => string;
};

type Activity = { root: string; stage: string; label: string };

/** One replacing toast per open project. The saved record is agent-reported, not a process heartbeat. */
export function useResearchStatus(root?: string) {
  const { t } = useLingui();
  const [activity, setActivity] = useReducer((current: Activity | null, next: Activity | null) =>
    current?.root === next?.root && current?.stage === next?.stage && current?.label === next?.label
      ? current : next, null);
  useEffect(() => {
    if (!root) return;
    const titles: Record<string, string> = {
      formulation: t`Formulating the problem`, "search-plan": t`Planning source searches`, "prior-knowledge": t`Reviewing prior knowledge`,
      "mind-map": t`Expanding the mind map`, "mind-map-review": t`Reviewing the mind map`, ready: t`Mind map ready`,
      scratchpad: t`Updating the scratchpad`, setup: t`Preparing setup and baseline`, experiments: t`Running experiments`, analysis: t`Analysing results`, reporting: t`Writing the research record`,
    };
    return watchResearchStatus(root, titles, {
      subagentReviewed: t`Mind map ready (subagent reviewed)`, complete: t`Research stage complete`, status: t`Research status`, paused: t`Research paused`, stopped: t`Stopped by the user. Saved evidence is preserved.`,
      idle: t`Research not started`, blocked: t`Research needs attention`, needsReview: t`Mind map needs review`,
      noPass: t`No passing review matches the current saved evidence.`, passed: t`Mind map review passed`,
      revise: t`Mind map needs revision`, outdated: t`Research status may be outdated`,
      unavailable: t`Research status unavailable`,
      pass: (pass: number) => t`Pass ${pass} of at least 3. `,
      reported: (updated: string) => t`Last reported at ${updated}`,
    }, setActivity);
  }, [root, t]);
  return activity?.root === root ? activity : null;
}

// Keep asynchronous supervision outside the React render/compiler scope.
function watchResearchStatus(root: string, titles: Record<string, string>, copy: StatusCopy, setActivity: (activity: Activity | null) => void) {
    const key = `research-status:${root}`;
    let disposed = false, busy = false, last = "";
    let stoppedAt = 0;
    const publish = (title: string, detail: string, warning = false) => {
      if (disposed) return;
      const signature = `${title}:${detail}`;
      if (signature === last) return;
      last = signature;
      (warning ? notifyWarning : notifyInfo)(copy.status, title, {detail, dedupeKey: key, timeoutMs: 0});
    };
    const stop = (event: MessageEvent) => {
      if (event.data?.type !== "synara:campaign-stop" || event.data.workspaceRoot !== root) return;
      const frame = Array.from(document.querySelectorAll("iframe")).find(frame => frame.contentWindow === event.source);
      if (!frame || new URL(frame.src, location.href).origin !== event.origin) return;
      stoppedAt = Date.now();
      setActivity(null);
      publish(copy.paused, copy.stopped);
    };
    window.addEventListener("message", stop);
    const refresh = async () => {
      try {
        const raw = await readResearchFile(root, RESEARCH_STATE_PATH);
        if (disposed) return;
        if (!raw) { setActivity(null); dismissAppToastByDedupeKey(key); last = ""; return; }
        const s = parseResearchState(raw);
        if (stoppedAt && Date.parse(s.updatedAt) <= stoppedAt) return;
        stoppedAt = 0;
        const old = Date.now() - Date.parse(s.updatedAt) > 5 * 60_000;
        setActivity(s.status === "running" && !old ? { root, stage: s.stage, label: titles[s.stage] } : null);
        const pass = s.stage === "prior-knowledge" && s.pass ? copy.pass(s.pass) : "";
        const updated = new Date(s.updatedAt).toLocaleTimeString();
        let title = s.status === "idle" ? copy.idle : s.status === "paused" ? copy.paused : s.status === "blocked" ? copy.blocked : s.status === "complete" && s.stage !== "ready" ? copy.complete : titles[s.stage];
        let detail = `${pass}${s.detail}\n${copy.reported(updated)}`;
        if (s.status === "idle") detail = s.detail;
        let warning = s.status === "blocked";
        const reportRaw = s.reviewRequestId ? await readResearchFile(root, `sources/reviews/${s.reviewRequestId}.json`) : null;
        const report = reportRaw ? JSON.parse(reportRaw) as MapReview : null;
        if (disposed) return;
        if (s.stage === "ready" && s.status === "complete") {
          const valid = await isCurrentMapReview(root, s, report);
          if (disposed) return;
          if (valid && report?.reviewer === "subagent") title = copy.subagentReviewed;
          if (!valid) { title = copy.needsReview; detail = copy.noPass; warning = true; }
        } else if (s.stage === "mind-map-review" && s.status !== "paused" && report) {
          title = report.verdict === "pass" ? copy.passed : report.verdict === "error" ? copy.blocked : report.verdict === "stale" ? copy.needsReview : copy.revise;
          detail = report.summary; warning = report.verdict !== "pass";
          if (report.verdict === "pass") {
            const valid = await isCurrentMapReview(root, s, report);
            if (disposed) return;
            if (!valid) { title = copy.needsReview; detail = copy.noPass; warning = true; }
            else if (report.reviewer === "subagent") title = copy.subagentReviewed;
          }
        } else if (old && s.status === "running") { title = copy.outdated; warning = true; }
        publish(title, detail, warning);

      } catch (error) {
        if (disposed) return;
        setActivity(null);
        publish(copy.unavailable, String(error), true);
      }
    };
    const tick = () => {
      if (busy || disposed) return;
      busy = true;
      return refresh().finally(() => { busy = false; });
    };
    void tick(); const timer = window.setInterval(() => void tick(), 2000);
    return () => { disposed = true; window.removeEventListener("message", stop); clearInterval(timer); dismissAppToastByDedupeKey(key); };
}
