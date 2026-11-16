import { invoke } from "@tauri-apps/api/core";
import { useEffect, useReducer } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "../components/ui/button";
import { InlineMessage } from "../components/ui/inline-message";
import { CommitExperiments } from "./commit-experiments";
import { useLatestLoad } from "./use-latest-load";
import "./git-graph.css";

const COMMIT_PAGE = 100;
export function GitGraph({ root, refreshing, openFile }: {
  root: string;
  refreshing: boolean;
  openFile: (path: string) => void;
}) {
  const { t } = useLingui();
  const [limit, more] = useReducer((current: number) => current + COMMIT_PAGE, COMMIT_PAGE);
  const [selected, select] = useReducer((_: string | null, next: string) => next, null);
  const graph = useLatestLoad<string>();
  const { revalidate } = graph;
  useEffect(() => {
    if (!refreshing) revalidate(root, () => invoke<string>("git_graph", { projectRoot: root, limit }));
  }, [root, limit, refreshing, revalidate]);
  const lines = (graph.value ?? "").trimEnd().split("\n").filter(Boolean);
  const commitCount = lines.filter((line) => line.includes("\x1f")).length;
  return <section className="git-graph" aria-label={t`Git graph`}>
    {graph.loading && <p role="status">{t`Loading Git graph…`}</p>}
    {graph.error && <InlineMessage level="warning">{graph.error}</InlineMessage>}
    {graph.value === "" && <p>{t`No Git commits yet.`}</p>}
    {selected && <CommitExperiments key={selected} root={root} hash={selected} standalone openFile={openFile} />}
    {lines.length > 0 && <div className="git-graph-lanes">
      {lines.map((line, index) => {
        const [lane, hash, short, refs, ...message] = line.split("\x1f");
        if (!hash) return <code className="git-graph-connector" aria-hidden="true" key={index}>{lane}</code>;
        const subject = message.join("\x1f");
        const label = [short, refs.trim(), subject].filter(Boolean).join(" ");
        return <button key={hash} type="button" aria-pressed={selected === hash} title={label} onClick={() => select(hash)}>
          <code aria-hidden="true">{lane}</code>
          <span>{label}</span>
        </button>;
      })}
    </div>}
    {commitCount >= limit && limit < 1000 && <Button variant="ghost" size="compact" onClick={more}>{t`Show older history`}</Button>}
  </section>;
}
