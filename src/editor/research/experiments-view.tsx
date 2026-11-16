import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { notifyError } from "../../telemetry/app-notify";
import { invoke } from "@tauri-apps/api/core";
import { toMessage } from "../../app-utils";
import { lazy, Suspense, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { ArrowLeft, ArrowUpRight, GitBranch } from "lucide-react";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import { InlineMessage } from "../../components/ui/inline-message";
const CampaignStrip = lazy(() => import("./campaign-strip").then(module => ({default: module.CampaignStrip})));
import { ExperimentList } from "./experiment-list";
import { ExperimentStatus } from "./experiment-status";
import { EXPERIMENT_BRANCH_SELECTION, EXPERIMENTS_PATH, MIND_MAP_PATH, parseExperiments, parseLaunchFailure, parseMindMap, parseRun, projectEvidencePath, runPath, type Experiment } from "./research-documents";
import { clearResearchItem, selectResearchItem, useProjectText } from "./research-links";

function useRun(root: string, id: string) {
  const read = useProjectText(root, runPath(id), 2000);
  const run = read?.source ? parseRun(read.source) : null;
  const launchRead = useProjectText(root, read && !read.source && !read.failed ? `experiments/${id}/launch-status.json` : "", 2000);
  const launchFailure = launchRead?.source ? parseLaunchFailure(launchRead.source) : null;
  return {
    run,
    launchFailure,
    failed: read?.failed || Boolean(read?.source && !run) || launchRead?.failed || Boolean(launchRead?.source && !launchFailure),
    loading: !read || (!read.source && !read.failed && !launchRead),
  };
}

function RunStatus({ run, failed, loading, launchFailure, queued }: ReturnType<typeof useRun> & { queued?: boolean }) {
  const [now, tick] = useReducer(() => Date.now() / 1000, 0);
  useEffect(() => {
    if (run?.status !== "running") return;
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => window.clearInterval(timer);
  }, [run?.status]);
  if (loading) return <ExperimentStatus />;
  if (failed) return <ExperimentStatus status="unavailable" />;
  if (launchFailure) return <ExperimentStatus status="failed" />;
  if (!run) return <ExperimentStatus status={queued ? "queued" : "planned"} />;
  const stale = run.status === "running" && now > run.updatedAt + 8;
  return <ExperimentStatus status={stale ? "stale" : run.status} />;
}

function CommitLink({ hash, openCommit }: { hash: string; openCommit?: (hash: string) => void }) {
  const { t } = useLingui();
  if (openCommit) return <Button variant="ghost" size="compact" title={hash} aria-label={t`Open Git commit ${hash} in Versions`}
    onClick={() => openCommit(hash)}>
    {t`Git commit`} <code>{hash.slice(0, 8)}</code>
  </Button>;
  return <Button variant="ghost" size="compact" title={hash} aria-label={t`Copy Git commit ${hash}`}
    onClick={() => { void writeText(hash).catch((error: unknown) => notifyError("research", t`Could not copy Git commit`, { detail: toMessage(error) })); }}>
    {t`Git commit`} <code>{hash.slice(0, 8)}</code>
  </Button>;
}

function readValidation(source?: string | null) {
  try { return source ? JSON.parse(source) as {status?: string; reason?: string; retained?: boolean} : null; }
  catch { return null; }
}

export function ExperimentNoteHeader({ root, id, openFile, openCommit }: {
  root: string;
  id: string;
  openFile: (path: string) => void;
  openCommit?: (hash: string) => void;
}) {
  const { t, i18n } = useLingui();
  const journal = useProjectText(root, EXPERIMENTS_PATH);
  const experiment = journal?.source ? parseExperiments(journal.source)?.find((item) => item.id === id) : undefined;
  const read = useRun(root, id);
  const run = read.run;
  const validationFile = useProjectText(root, `experiments/${id}/validation.json`, 2000);
  const validation = readValidation(validationFile?.source);
  const seconds = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 });
  return <section className="experiment-note-status" aria-label={t`Run progress`}>
    <div className="experiment-links">
      <Button variant="ghost" size="compact" onClick={() => {
        selectResearchItem({ root, path: EXPERIMENT_BRANCH_SELECTION, id: "" });
        openFile(EXPERIMENTS_PATH);
      }}>
        <ArrowLeft size={14} aria-hidden="true" />{t`All experiments`}
      </Button>
      <code>{id}</code>
      <RunStatus {...read} queued={experiment?.queued} />
      <span>{validation?.status === "passed" ? t`Validated` : validation?.status === "rejected" ? t`Rejected` : validation?.status === "error" ? t`Verification error` : t`Unverified`}</span>
      {validation?.retained && <span>{t`Retained as best`}</span>}
      {validation?.reason && <span>{validation.reason}</span>}
      {run && <span>{experiment?.totalCases
        ? t`${run.completedCases} of ${experiment.totalCases} cases checked`
        : t`${run.completedCases} cases checked`} · {seconds.format(run.elapsedSeconds)} s</span>}
      {experiment && <Button variant="ghost" size="compact" onClick={() => {
        selectResearchItem({ root, path: MIND_MAP_PATH, id: experiment.nodeId });
        openFile(MIND_MAP_PATH);
      }}><GitBranch size={14} aria-hidden="true" />{t`Mind map`}</Button>}
      {run?.gitCommit && <CommitLink hash={run.gitCommit} openCommit={openCommit} />}
      {run && <Button variant="ghost" size="compact" onClick={() => openFile(runPath(id))}>{t`Run receipt`}</Button>}
    </div>
    {run?.status === "running" && run.activeCase && <p>{t`Checking ${run.activeCase}`}</p>}
    {read.failed && <InlineMessage level="warning">{t`The run receipt could not be read.`}</InlineMessage>}
    {read.launchFailure && <InlineMessage level="warning">{read.launchFailure.reason}</InlineMessage>}
  </section>;
}

function ExperimentDetails({ experiment, root, openNode, openFile, close, related }: {
  experiment: Experiment;
  root: string;
  openNode: (id: string) => void;
  openFile: (path: string) => void;
  close: () => void;
  related: () => void;
}) {
  const { t, i18n } = useLingui();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const map = useProjectText(root, MIND_MAP_PATH);
  const topics = map?.source ? parseMindMap(map.source) : null;
  const nodeLabel = topics?.find(({ id }) => id === experiment.nodeId)?.label;
  const read = useRun(root, experiment.id);
  const run = read.run;
  const base = `experiments/${experiment.id}/`;
  const notePath = base + "experiment.md";
  const note = useProjectText(root, notePath);
  const [noteError, setNoteError] = useReducer((_: string, next: string) => next, "");
  const [creating, setCreating] = useReducer((_: boolean, next: boolean) => next, false);
  useEffect(() => {
    if (note?.source != null && !creating && !noteError) { close(); openFile(notePath); }
  }, [note?.source, notePath, openFile, close, creating, noteError]);
  async function createNote() {
    setCreating(true);
    setNoteError("");
    const content = [
      `# ${experiment.title}`, "",
      `## ${t`Outcome`}`, "", experiment.outcome || t`No outcome recorded yet.`, "",
      `## ${t`Experiment plan`}`, "",
      `### ${t`Hypothesis`}`, "", experiment.hypothesis, "",
      `### ${t`Baseline`}`, "", experiment.baseline, "",
      `### ${t`Success criteria`}`, "", experiment.success, "",
      `[${t`Open plan`}](</${experiment.plan}>)`, "",
      `## ${t`Evidence`}`, "",
      // eslint-disable-next-line lingui/no-unlocalized-strings -- Markdown destinations are filenames; labels are translated.
      `[${t`All cases`}](cases.jsonl) · [${t`Output`}](stdout.txt) · [${t`Errors`}](stderr.txt) · [${t`Run receipt`}](run-status.json)`, "",
    ].join("\n");
    try {
      await invoke("create_project_entry", { projectRoot: root, path: notePath, kind: "file" });
      await invoke("write_project_file", { projectRoot: root, path: notePath, content, expectedContent: "# Notes\n" });
      if (mounted.current) { close(); openFile(notePath); }
    } catch (error) { if (mounted.current) setNoteError(toMessage(error)); }
    if (mounted.current) setCreating(false);
  }
  const seconds = new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 });
  const duration = (value: number) => seconds.format(value);
  return <article className="experiment-details" aria-label={t`Experiment details`}>
    <div className="experiment-detail-nav">
      <Button variant="ghost" size="compact" onClick={close}>
        <ArrowLeft size={14} aria-hidden="true" />{t`All experiments`}
      </Button>
    </div>
    <header className="experiment-detail-header">
      <div className="experiment-detail-title">
        <code>{experiment.id}</code>
        <h2 ref={heading} tabIndex={-1}>{experiment.title}</h2>
      </div>
      <RunStatus {...read} queued={experiment.queued} />
      <div className="experiment-links">
        {nodeLabel ? <Button variant="ghost" size="compact" onClick={() => openNode(experiment.nodeId)}>
          <GitBranch size={14} aria-hidden="true" />{t`Mind map: ${nodeLabel}`}
        </Button> : map && <span>{t`Mind map topic unavailable`}</span>}
        <Button variant="ghost" size="compact" onClick={() => openFile(experiment.plan)}>{t`Open plan`}</Button>
        {run?.gitCommit && <CommitLink hash={run.gitCommit} />}
        <Button variant="ghost" size="compact" onClick={related}>{t`Related attempts`}</Button>
      </div>
    </header>
    {noteError && <InlineMessage level="warning">{noteError}</InlineMessage>}
    <Button variant="ghost" size="compact" disabled={creating || !note || note.failed} onClick={() => { void createNote(); }}>{t`Create experiment note`}</Button>
    {read.failed && <InlineMessage level="warning">{t`The run receipt could not be read.`}</InlineMessage>}
    {read.launchFailure && <section className="experiment-overview">
      <h3>{t`Launch failed`}</h3>
      <p>{read.launchFailure.reason}</p>
      {read.launchFailure.exitCode !== undefined && <p>{t`Exit code ${read.launchFailure.exitCode}`}</p>}
      <Button variant="ghost" size="compact" onClick={() => openFile(base + "launch-status.json")}>{t`Launch report`}</Button>
    </section>}
    {(run || experiment.outcome) && <div className="experiment-overview">
      {experiment.outcome && <section className="experiment-outcome">
        <h3>{t`Outcome`}</h3><p>{experiment.outcome}</p>
      </section>}
      {run && <section className="experiment-progress" aria-label={t`Run progress`}>
        <div>
          {experiment.totalCases ? t`${run.completedCases} of ${experiment.totalCases} cases checked` : t`${run.completedCases} cases checked`}
          <span>{t`${duration(run.elapsedSeconds)} of ${duration(run.limitSeconds)} s`}</span>
        </div>
        {run.status !== "completed" && experiment.totalCases &&
          <progress max={experiment.totalCases} value={run.completedCases} aria-label={t`Cases checked`} />}
        {run.status === "running" && run.activeCase && <p>{t`Checking ${run.activeCase}`}</p>}
        {run.exitCode !== undefined && run.exitCode !== 0 && <p>{t`Exit code ${run.exitCode}`}</p>}
      </section>}
    </div>}
    <details className="experiment-plan" open={!run}>
      <summary>{t`Experiment plan`}</summary>
      <dl className="experiment-facts">
        <div><dt>{t`Hypothesis`}</dt><dd>{experiment.hypothesis}</dd></div>
        <div><dt>{t`Baseline`}</dt><dd>{experiment.baseline}</dd></div>
        <div><dt>{t`Success criteria`}</dt><dd>{experiment.success}</dd></div>
      </dl>
    </details>
    {run && <section className="experiment-results">
      <div className="experiment-results-heading">
        <h3>{t`Latest case results`}</h3>
        <div className="experiment-links">
          {run.completedCases > 0 && <Button variant="ghost" size="compact" onClick={() => openFile(base + "cases.jsonl")}>{t`All cases`}</Button>}
          <Button variant="ghost" size="compact" onClick={() => openFile(base + "stdout.txt")}>{t`Output`}</Button>
          <Button variant="ghost" size="compact" onClick={() => openFile(base + "stderr.txt")}>{t`Errors`}</Button>
          <Button variant="ghost" size="compact" onClick={() => openFile(runPath(experiment.id))}>{t`Run receipt`}</Button>
        </div>
      </div>
      {run.results.length > 0 && <table className="experiment-cases" aria-label={t`Latest case results`}>
        <thead><tr><th scope="col">{t`Case`}</th><th scope="col">{t`Result`}</th><th scope="col">{t`Evidence`}</th></tr></thead>
        <tbody>{run.results.slice().reverse().map(({ case: label, result, evidence }, index) => {
          const path = evidence ? projectEvidencePath(evidence) : null;
          return <tr key={run.completedCases - index}><th scope="row">{label}</th><td>{result}</td><td>
            {path && <IconButton size="compact" label={t`Open file`} tooltip={path.split("/").at(-1)} onClick={() => openFile(path)}>
              <ArrowUpRight size={14} aria-hidden="true" />
            </IconButton>}
          </td></tr>;
        })}</tbody>
      </table>}
    </section>}
  </article>;
}

export function ExperimentsView({ experiments, root, requestedId, requestedBranch, branch, changeBranch, openNode, openFile }: {
  experiments: Experiment[];
  root: string;
  requestedId?: string;
  requestedBranch?: string;
  branch: string;
  changeBranch: (id: string) => void;
  openNode: (id: string) => void;
  openFile: (path: string) => void;
}) {
  const [selectedId, select] = useReducer((_: string | undefined, next: string | undefined) => next, requestedId);
  const [relatedTo, showRelated] = useReducer((_: string | undefined, next: string | undefined) => next, undefined);
  const [focusList, returnFocus] = useReducer(() => true, false);
  useLayoutEffect(() => {
    if (requestedBranch === undefined) return;
    select(undefined);
    showRelated(undefined);
    returnFocus();
  }, [requestedBranch]);
  useLayoutEffect(() => {
    if (!requestedId) return;
    select(requestedId);
    clearResearchItem({ root, path: EXPERIMENTS_PATH, id: requestedId });
  }, [requestedId, root]);
  const activeId = requestedId ?? selectedId;
  const selected = experiments.find(({ id }) => id === activeId);
  const close = () => { returnFocus(); select(undefined); };
  return <>
    <Suspense fallback={null}><CampaignStrip root={root} /></Suspense>
    <ExperimentList root={root} branch={branch} changeBranch={changeBranch} relatedTo={relatedTo} select={select}
      visible={!selected} focusSearch={focusList} clearRelated={() => showRelated(undefined)} />
    {selected && <ExperimentDetails key={`${root}/${selected.id}`} experiment={selected} root={root}
      openNode={openNode} openFile={openFile} close={close} related={() => { showRelated(selected.id); close(); }} />}
  </>;
}
