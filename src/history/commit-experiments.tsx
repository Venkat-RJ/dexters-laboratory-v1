import { useEffect, useMemo, useReducer, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "../components/ui/button";
import { InlineMessage } from "../components/ui/inline-message";
import { useExperimentQuery } from "../editor/research/experiment-query";
import { ExperimentStatus } from "../editor/research/experiment-status";
import { EXPERIMENTS_PATH } from "../editor/research/research-documents";
import { selectResearchItem } from "../editor/research/research-links";

const RUN_PAGE = 20;

export function CommitExperiments({ root, hash, openFile, standalone = false }: {
  root: string;
  hash: string;
  openFile: (path: string) => void;
  standalone?: boolean;
}) {
  const { t, i18n } = useLingui();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (standalone) heading.current?.focus(); }, [standalone]);
  const [offset, setOffset] = useReducer((_: number, next: number) => next, 0);
  const query = useMemo(() => ({
    view: "all" as const, sort: "updated" as const, gitCommit: hash, search: "", limit: RUN_PAGE, offset,
  }), [hash, offset]);
  const result = useExperimentQuery(root, query);
  const page = result?.page;
  const number = new Intl.NumberFormat(i18n.locale, { maximumSignificantDigits: 12 });
  const outcomes = { improved: t`Improved`, neutral: t`Neutral`, worse: t`Worse`, failed: t`Failed` };
  if (!standalone && !result?.error && !page?.total) return null;
  return <section className="version-experiments" aria-label={t`Experiments at this commit`}>
    {standalone && <>
      <h3 ref={heading} tabIndex={-1}>{t`Experiments at this commit`}</h3>
      <code className="version-experiments-hash">{hash}</code>
    </>}
    {!result && <p role="status">{t`Loading experiments…`}</p>}
    {result?.error && <InlineMessage level="warning">{result.error}</InlineMessage>}
    {page?.total === 0 && <p>{t`No experiments linked to this commit.`}</p>}
    {page && page.total > 0 && <>
      <ul>
        {page.rows.map((row) => {
          const metric = row.metric;
          const score = metric ? number.format(metric.value) : "";
          const baseline = metric ? number.format(metric.baseline) : "";
          return <li key={row.id}>
            <Button variant="ghost" size="compact" onClick={() => {
              selectResearchItem({ root, path: EXPERIMENTS_PATH, id: row.id });
              openFile(EXPERIMENTS_PATH);
            }}>{row.id} · {row.title}</Button>
            <div>
              {row.validation === "rejected" ? t`Rejected` : row.validation === "error" ? t`Verification error` : row.scoreOutcome ? outcomes[row.scoreOutcome] : <ExperimentStatus status={row.status} />}
              {metric && <> · {metric.name} {t`${score} vs ${baseline}`} {metric.unit}</>}
            </div>
          </li>;
        })}
      </ul>
      {page.total > RUN_PAGE && <div className="version-actions">
        <Button variant="ghost" size="compact" disabled={!page.offset} onClick={() => setOffset(page.offset - RUN_PAGE)}>{t`Previous`}</Button>
        <Button variant="ghost" size="compact" disabled={page.offset + RUN_PAGE >= page.total} onClick={() => setOffset(page.offset + RUN_PAGE)}>{t`Next`}</Button>
      </div>}
    </>}
  </section>;
}
