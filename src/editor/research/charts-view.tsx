import { useEffect, useMemo, useReducer, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { View, parse, changeset, type Spec } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { expressionInterpreter } from "vega-interpreter";
import { Button } from "../../components/ui/button";
import { InlineMessage } from "../../components/ui/inline-message";
import { useTrackerResult } from "./experiment-query";
import { chartProgress, type ChartRow } from "./chart-progress";

const INPUT = {};

function ProgressPlot({ progress, select }: {progress: ReturnType<typeof chartProgress>; select: (id: string) => void}) {
  const { t } = useLingui();
  const element = useRef<HTMLDivElement>(null);
  const view = useRef<View | null>(null);
  const metricName = progress.reference?.metric?.name;
  const spec = useMemo(() => ({
    data: {name: "progress"}, width: 700, height: 240,
    autosize: {type: "fit", contains: "padding"},
    layer: [
      {mark: {type: "line", interpolate: "step-after", color: "#26745b", strokeWidth: 2.5}, encoding: {
        x: {field: "attempt", type: "quantitative", title: t`Attempt`},
        y: {field: "best", type: "quantitative", title: metricName ?? t`Score`, scale: {zero: false}},
      }},
      // Vega expression syntax, not user-facing text.
      // eslint-disable-next-line lingui/no-unlocalized-strings
      {transform: [{filter: "datum.best != null"}], mark: {type: "point", filled: true, size: 14, opacity: 0.6}, encoding: {
        x: {field: "attempt", type: "quantitative"}, y: {field: "best", type: "quantitative"},
        color: {value: "#26745b"},
        tooltip: [{field: "id"}, {field: "score"}, {field: "best"}, {field: "state"}],
      }},
      // Vega expression syntax, not user-facing text.
      // eslint-disable-next-line lingui/no-unlocalized-strings
      {transform: [{filter: "datum.best == null"}], mark: {type: "point", shape: "cross", color: "#707070", size: 45}, encoding: {
        x: {field: "attempt", type: "quantitative"}, y: {value: {expr: "height"}},
        tooltip: [{field: "id"}, {field: "title"}, {field: "state"}],
      }},
    ],
  }) as TopLevelSpec, [t, metricName]);
  useEffect(() => {
    const container = element.current;
    if (!container) return;
    const chart = new View(parse(compile(spec).spec as Spec, undefined, {ast: true}), {
      expr: expressionInterpreter, renderer: "svg", container,
    });
    chart.addEventListener("click", (_event, item) => { if (item?.datum?.id) select(item.datum.id); });
    const width = () => Math.max(240, container.clientWidth);
    chart.width(width());
    let lastWidth = width();
    const resize = new ResizeObserver(() => {
      const nextWidth = width();
      if (nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      void chart.width(nextWidth).resize().runAsync();
    });
    resize.observe(container);
    view.current = chart;
    return () => { resize.disconnect(); chart.finalize(); view.current = null; container.replaceChildren(); };
  }, [spec, select]);
  useEffect(() => {
    void view.current?.change("progress", changeset().remove(() => true).insert(progress.points)).runAsync();
  }, [progress, spec]);
  return <div className="overall-progress-plot" ref={element} />;
}

export function ChartsView({root, openFile, openNode}: {
  root: string; openFile: (path: string) => void; openNode: (id: string) => void;
}) {
  const {t} = useLingui();
  const result = useTrackerResult<ChartRow[]>(root, "experiment_chart_progress", "input", INPUT, true);
  const [selectedId, select] = useReducer((_: string, next: string) => next, "");
  const rows = result?.value ?? [];
  const progress = useMemo(() => chartProgress(result?.value ?? []), [result?.value]);
  const selected = rows.find(row => row.id === selectedId);
  const selectedPoint = progress.points.find(point => point.id === selectedId);
  return <div className="charts-view">
    <p><strong>{t`Best overall score`}: {progress.best ?? t`Not measured`}</strong>
      {progress.reference && <> · {progress.reference.direction === "higher" ? t`Higher is better` : t`Lower is better`}</>}
    </p>
    <p>{t`${rows.length} attempts`} · {t`${rows.filter(r=>r.status === "completed").length} completed`} · {t`${rows.filter(r=>["failed","timed_out","interrupted"].includes(r.status)).length} failed`}</p>
    {result?.error && <InlineMessage level="warning">{result.error}</InlineMessage>}
    {!result && <p>{t`Loading scores…`}</p>}
    {progress.incompatible > 0 && <p>{t`Scores from different evaluations are marked without entering the best-score line.`}</p>}
    {rows.length > 0 ? <>
      <p>{t`One line shows the best overall score after each attempt. Click a point to see that attempt’s result.`}</p>
      <ProgressPlot progress={progress} select={select} />
      <p>{t`Attempts without an improvement keep the line flat. Before the first validated score, attempts appear along the bottom.`}</p>
    </> : result?.value && <p>{t`Attempts will appear here as they are recorded.`}</p>}
    {selected && <section aria-label={t`Selected attempt`}>
      <p>{selected.id} · {selected.title} · {selectedPoint?.state}
        {selectedPoint?.score != null && <> · {selected.metric?.name} {selectedPoint.score}</>}</p>
      <div className="experiment-links"><Button onClick={()=>openFile(`experiments/${selected.id}/experiment.md`)}>{t`Experiment note`}</Button><Button onClick={()=>openNode(selected.nodeId)}>{t`Mind map`}</Button></div>
    </section>}
  </div>;
}
