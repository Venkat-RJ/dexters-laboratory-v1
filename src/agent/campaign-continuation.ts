import { invoke } from "@tauri-apps/api/core";
import type { RefObject } from "react";

type Context = {threadId: string; workspaceRoot: string; state: string};
type Summary = {id: string; status: string; decisionRevision?: number; agentThreadId?: string; runningCount: number; queuedCount: number; verificationCount?: number};

export function watchCampaign(
  contextRef: RefObject<Context | null>, rootRef: RefObject<string | null>,
  postMessage: (message: object) => Promise<void>,
) {
  let disposed = false;
  let delivered = "";
  let pending = false;
  let attached = "";
  let stopGeneration = 0;
  const stop = (event: MessageEvent) => {
    const context = contextRef.current;
    if (!context || event.data?.type !== "synara:campaign-stop" || event.data.workspaceRoot !== context.workspaceRoot || event.data.threadId !== context.threadId) return;
    const frame = Array.from(document.querySelectorAll("iframe")).find(frame => frame.contentWindow === event.source);
    if (!frame || new URL(frame.src, location.href).origin !== event.origin) return;
    stopGeneration += 1;
    void invoke("research_campaign", {projectRoot: context.workspaceRoot, request: {
      action: "stop", operationId: `user-stop-${crypto.randomUUID()}`,
    }}).catch(() => undefined);
  };
  window.addEventListener("message", stop);
  const timer = window.setInterval(async () => {
    const context = contextRef.current;
    if (context && context.state === "running" && attached !== context.threadId) {
      if (await attachCampaign(context)) attached = context.threadId;
    }
    if (pending || !context || context.state !== "idle" || context.workspaceRoot !== rootRef.current) return;
    pending = true;
    const generation = stopGeneration;
    try {
      const reply = await invoke<{ok: boolean; campaign?: Summary}>("research_campaign", {projectRoot: context.workspaceRoot, request: {action: "inspect", compact: true}});
      const campaign = reply.campaign;
      if (disposed || generation !== stopGeneration || !campaign || campaign.status !== "running" || campaign.agentThreadId !== context.threadId || campaign.runningCount || campaign.queuedCount || campaign.verificationCount) return;
      const key = `${campaign.id}:${campaign.decisionRevision ?? 0}`;
      if (key === delivered) return;
      await postMessage({type: "lattice:composer-prompt", version: 1, requestId: `campaign-${key}`,
        workspaceRoot: context.workspaceRoot, mode: "send",
        // eslint-disable-next-line lingui/no-unlocalized-strings -- Agent-facing instruction.
        text: "Use research-results-analysis: read campaign summary, receipts and question; explain findings, alternatives and next test. Run a justified bounded batch in this campaign or verify the report. If there is no justified next experiment, verify the selected result, finish reporting and complete the campaign with a reason. Respect explicit deadlines and user stops; never renew a deadline with a new campaign."});
      delivered = key;
    } catch { /* Retry transport after the next observed idle interval. */ }
    finally { pending = false; }
  }, 2000);
  return () => { disposed = true; window.clearInterval(timer); window.removeEventListener("message", stop); };
}

export async function attachCampaign(context: Context) {
  try {
    const reply = await invoke<{campaign?: {agentThreadId?: string}}>("research_campaign", {
      projectRoot: context.workspaceRoot, request: {action: "inspect", compact: true},
    });
    if (!reply.campaign) return false;
    if (!reply.campaign.agentThreadId) await invoke("research_campaign", {
      projectRoot: context.workspaceRoot, request: {action: "attach-agent", operationId: `attach-${crypto.randomUUID()}`, threadId: context.threadId},
    });
    return true;
  } catch { return false; }
}
