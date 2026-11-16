import { useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "../../components/ui/button";
import { InlineMessage } from "../../components/ui/inline-message";
import { SearchField } from "../../components/ui/search-field";
import { useExperimentQuery, type ExperimentSort, type ExperimentView, type ScoreOutcome } from "./experiment-query";
import { ExperimentStatus } from "./experiment-status";
import { projectTopics } from "./mind-map-layout";
import { MIND_MAP_PATH, parseMindMap } from "./research-documents";
import { useProjectText } from "./research-links";

const PAGE_SIZE = 50;

type Filters = {
  view: ExperimentView;
  sort: ExperimentSort;
  search: string;
  scoreOutcome?: ScoreOutcome;
  offset: number;
};

const initialFilters: Filters = { view: "all", sort: "updated", search: "", offset: 0 };

export function ExperimentList({ root, branch, changeBranch, relatedTo, select, visible, focusSearch, clearRelated }: {
  root: string;
  branch: string;
  changeBranch: (id: string) => void;
  relatedTo?: string;
  select: (id: string) => void;
  visible: boolean;
  focusSearch: boolean;
  clearRelated: () => void;
}) {
  const { t, i18n } = useLingui();
  const searchBox = useRef<HTMLInputElement>(null);
  const [filters, change] = useReducer((state: Filters, next: Partial<Filters>) => (
    { ...state, offset: 0, ...next }
  ), initialFilters);
  useLayoutEffect(() => {
    if (visible && focusSearch) searchBox.current?.focus({ preventScroll: true });
  }, [focusSearch, visible]);
  const previousBranch = useRef(branch);
  useLayoutEffect(() => {
    if (previousBranch.current === branch) return;
    previousBranch.current = branch;
    change({ view: "all", search: "", scoreOutcome: undefined });
  }, [branch]);
  useLayoutEffect(() => {
    if (relatedTo) {
      changeBranch("");
      change({ view: "all", search: "", scoreOutcome: undefined });
    }
  }, [relatedTo, changeBranch]);
  const map = useProjectText(root, MIND_MAP_PATH);
  const topics = useMemo(() => {
    const parsed = map?.source ? parseMindMap(map.source) : null;
    return parsed ? projectTopics(parsed) : [];
  }, [map]);
  const request = useMemo(() => {
    // The map stores each branch contiguously, with its descendants immediately after it.
    const branchIndex = topics.findIndex(({ id }) => id === branch);
    const descendantNodeIds: string[] = [];
    if (branchIndex !== -1) {
      for (let i = branchIndex + 1; i < topics.length && topics[i].depth > topics[branchIndex].depth; i++) {
        descendantNodeIds.push(topics[i].id);
      }
    }
    return { ...filters, nodeId: branch || undefined, relatedTo, limit: PAGE_SIZE,
      descendantNodeIds: descendantNodeIds.length ? descendantNodeIds : undefined };
  }, [filters, branch, relatedTo, topics]);
  const result = useExperimentQuery(root, request, visible && (!branch || map !== null));
  const page = result?.page;
  const labels = useMemo(() => new Map(topics.map(({ id, title }) => [id, title])), [topics]);
  const date = useMemo(() => new Intl.DateTimeFormat(i18n.locale, { dateStyle: "medium", timeStyle: "short" }), [i18n.locale]);
  const number = useMemo(() => new Intl.NumberFormat(i18n.locale, { maximumSignificantDigits: 12 }), [i18n.locale]);
  const first = number.format((page?.offset ?? 0) + 1);
  const last = number.format((page?.offset ?? 0) + (page?.rows.length ?? 0));
  const total = number.format(page?.total ?? 0);
  const views: [ExperimentView, string][] = [
    ["active", t`Planned & running`], ["all", t`All`], ["attention", t`Needs attention`],
  ];
  const outcomes: Record<ScoreOutcome, string> = {
    improved: t`Improved`, neutral: t`Neutral`, worse: t`Worse`, failed: t`Failed`,
  };
  const resetScope = () => { clearRelated(); changeBranch(""); change({ search: "", view: "all", scoreOutcome: undefined }); };

  return <div className="experiment-tracker" hidden={!visible}>
    <div className="experiment-tracker-controls">
      <div className="experiment-views" aria-label={t`Run status`}>
        {views.map(([key, label]) => <Button key={key} variant={request.view === key ? "secondary" : "ghost"}
          size="compact" aria-pressed={request.view === key} onClick={() => { clearRelated(); change({ view: key, scoreOutcome: undefined }); }}>
          {label}{page && <span className="experiment-count">{number.format(page.counts[key])}</span>}
        </Button>)}
      </div>
      <div className="experiment-tracker-filters">
        <SearchField ref={searchBox} controlSize="compact" aria-label={t`Find experiment`} placeholder={t`Find experiment`}
          value={filters.search} onChange={(event) => change({ search: event.target.value })} onClear={() => change({ search: "" })} />
        <select aria-label={t`Research branch`} value={branch}
          onChange={(event) => { clearRelated(); changeBranch(event.target.value); }}>
          <option value="">{t`All branches`}</option>
          {branch && !labels.has(branch) && <option value={branch}>{branch}</option>}
          {topics.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
        </select>
        <select aria-label={t`Filter by outcome`} value={filters.scoreOutcome ?? ""}
          onChange={(event) => {
            const scoreOutcome = (event.target.value || undefined) as ScoreOutcome | undefined;
            change(scoreOutcome ? { scoreOutcome, view: "all" } : { scoreOutcome });
          }}>
          <option value="">{t`All outcomes`}</option>
          {Object.entries(outcomes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select aria-label={t`Sort experiments`} value={filters.sort}
          onChange={(event) => change({ sort: event.target.value as ExperimentSort })}>
          <option value="updated">{t`Recently updated`}</option>
          <option value="score">{t`Best score by evaluation`}</option>
          <option value="experiment">{t`Experiment ID`}</option>
        </select>
        {relatedTo && <Button variant="ghost" size="compact" onClick={resetScope}>{t`Clear related attempts`}</Button>}
      </div>
    </div>
    {result?.error && <InlineMessage level="warning">{t`The experiment tracker could not be loaded.`} {result.error}</InlineMessage>}
    {!result && <p className="experiment-tracker-empty" role="status">{t`Loading experiments…`}</p>}
    {page?.rows.length === 0 && <p className="experiment-tracker-empty">{t`No matching experiments`}</p>}
    {page && page.rows.length > 0 && <>
      <div className="experiment-tracker-scroll">
        <table aria-label={t`Experiments list`}>
          <thead><tr>
            <th scope="col">{t`Experiment`}</th>
            <th scope="col">{t`Research branch`}</th>
            <th scope="col">{t`Status`}</th>
            <th scope="col">{t`Progress`}</th>
            <th scope="col">{t`Result`}</th>
            <th scope="col">{t`Updated`}</th>
          </tr></thead>
          <tbody>{page.rows.map((row) => {
            const branch = labels.get(row.nodeId) ?? row.nodeId;
            const value = row.metric ? number.format(row.metric.value) : "";
            const baseline = row.metric ? number.format(row.metric.baseline) : "";
            const metric = row.metric
              ? [row.metric.name, t`${value} vs ${baseline}`, row.metric.unit].filter(Boolean).join(" ")
              : row.outcome;
            return <tr key={row.id}>
              <th scope="row"><button type="button" onClick={() => select(row.id)}>
                <span>{row.title}</span><code title={row.gitCommit ?? undefined}>{row.id}{row.gitCommit && ` · ${row.gitCommit.slice(0, 8)}`}</code>
              </button></th>
              <td><span title={branch}>{branch}</span></td>
              <td><ExperimentStatus status={row.status} /></td>
              <td className="experiment-tracker-number">
                {row.totalCases !== null
                  ? <>{number.format(row.completedCases ?? 0)} / {number.format(row.totalCases)}</>
                  : row.completedCases !== null && number.format(row.completedCases)}
              </td>
              <td>
                {row.validation === "rejected" ? <strong>{t`Rejected`} </strong> : row.validation === "error" ? <strong>{t`Verification error`} </strong> : !row.metric && row.status === "completed" ? <strong>{row.validation === "passed" ? t`Validated` : t`Unverified`} </strong> : null}
                {row.scoreOutcome && <strong>{outcomes[row.scoreOutcome]} </strong>}
                <span title={metric ?? undefined}>{metric}</span>
                {filters.sort === "score" && row.evaluation && row.metric && <div title={row.evaluation}>{row.evaluation}</div>}
              </td>
              <td className="experiment-tracker-date">{row.updatedAt !== null && date.format(row.updatedAt * 1000)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <div className="experiment-pages">
        <span>{t`${first}–${last} of ${total}`}</span>
        <Button variant="ghost" size="compact" disabled={page.offset === 0} onClick={() => change({ offset: page.offset - PAGE_SIZE })}>{t`Previous`}</Button>
        <Button variant="ghost" size="compact" disabled={page.offset + PAGE_SIZE >= page.total} onClick={() => change({ offset: page.offset + PAGE_SIZE })}>{t`Next`}</Button>
      </div>
    </>}
  </div>;
}
