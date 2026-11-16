import { useEffect, useReducer } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLingui } from "@lingui/react/macro";
import { Button } from "../../components/ui/button";

type Campaign = {
  status: string;
  reason: string;
  waitingForAgent?: boolean;
  remainingSeconds: number | null;
  runningCount: number;
  queuedCount: number;
  resources?: {cpuSeconds: number; peakRssBytes: number};
  best: Record<string, {attemptId: string; score: number}>;
};

type Reply = {ok: boolean; campaign?: Campaign | null; error?: string};
function normalize(reply: Reply) { return {campaign: reply.campaign ?? null, error: reply.error ?? ""}; }


export function CampaignStrip({root}: {root: string}) {
  const {t} = useLingui();
  const [state, update] = useReducer((previous: {campaign: Campaign | null; error: string}, next: Partial<{campaign: Campaign | null; error: string}>) => ({...previous, ...next}), {campaign: null, error: ""});
  useEffect(() => {
    let disposed = false;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const reply = await invoke<Reply>("research_campaign", {projectRoot: root, request: {action: "inspect", compact: true}});
        if (!disposed) update(normalize(reply));
      } catch (error) {
        if (!disposed) update({error: String(error)});
      }
      pending = false;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [root]);
  async function act(action: string) {
    try {
      const reply = await invoke<Reply>("research_campaign", {projectRoot: root, request: {action, compact: true, operationId: crypto.randomUUID()}});
      update(normalize(reply));
    } catch (error) { update({error: String(error)}); }
  }
  const campaign = state.campaign;
  if (!campaign) return state.error ? <p role="alert">{state.error}</p> : null;
  const minutes = campaign.remainingSeconds == null ? null : Math.ceil(campaign.remainingSeconds / 60);
  return <section className="experiment-tracker-filters" aria-label={t`Research campaign`}>
    <span>{campaign.waitingForAgent ? t`Waiting for agent` : campaign.reason}</span>
    <span>{minutes === null ? t`No time limit` : t`${minutes} minutes remaining`}</span>
    <span>{t`${campaign.runningCount} running`}</span>
    <span>{t`${campaign.queuedCount} queued`}</span>
    {campaign.resources && <span>{t`Observed CPU seconds`} {campaign.resources.cpuSeconds.toFixed(2)}</span>}
    {Object.entries(campaign.best).map(([evaluation, best]) => <span key={evaluation}>{t`Best`} {best.attemptId} · {best.score}</span>)}
    {campaign.status === "running" && <Button variant="ghost" size="compact" onClick={() => void act("pause")}>{t`Pause`}</Button>}
    {(campaign.status === "paused" || campaign.status === "stopped") && <Button variant="ghost" size="compact" onClick={() => void act("resume")}>{t`Resume`}</Button>}
    {(campaign.status === "running" || campaign.status === "paused") && <Button variant="ghost" size="compact" onClick={() => void act("stop")}>{t`Stop`}</Button>}
    {state.error && <span role="alert">{state.error}</span>}
  </section>;
}
