import { useEffect, useId, useMemo } from "react";
import { useLingui } from "@lingui/react/macro";
import { BookOpen, FlaskConical, Lightbulb, Network, ScanLine } from "lucide-react";
import {
  Background, getViewportForBounds, ReactFlow, ReactFlowProvider, useReactFlow, useStore,
  ViewportPortal, type Node, type NodeProps, type ReactFlowState,
} from "@xyflow/react";
import { Button } from "../../components/ui/button";
import type { ExperimentBranchSummary, ScoreOutcome } from "./experiment-query";
import { useExperimentStatusLabel } from "./experiment-status-label";
import { NODE_HEIGHT, NODE_WIDTH, ROOT_HEIGHT, ROOT_WIDTH, getConnections, laneColor, placeTopics, type Topic } from "./mind-map-layout";
import "@xyflow/react/dist/style.css";

const MIN_ZOOM = 0.35;
const READING_ZOOM = 0.95;
const WINDOW_NODE_COUNT = 64;
const OVERSCAN = 256;

type TopicNode = Node<{ topic: Topic; isRoot: boolean; summary?: ExperimentBranchSummary; navigate: (id: string) => void }, "topic">;

const roleIcons = { question: Network, hypothesis: Lightbulb, evidence: BookOpen, test: FlaskConical, result: ScanLine, topic: null };

function TopicCard({ data: { topic, isRoot, summary, navigate } }: NodeProps<TopicNode>) {
  const { t } = useLingui();
  const summaryId = useId();
  const Icon = roleIcons[topic.role];
  const roleLabel = {
    question: t`Research question`, hypothesis: t`Hypothesis`, evidence: t`Evidence`,
    test: t`Proposed test`, result: t`Recorded finding`, topic: undefined,
  }[topic.role];
  const content = <span className="research-map-topic-heading">
    {Icon && <Icon className="research-map-role-icon" size={15} aria-hidden="true" />}
    <span className="research-map-topic-title">{topic.title}</span>
  </span>;
  return <div className="research-map-topic nopan" data-root={isRoot || undefined}
    data-role={topic.role} data-depth={topic.depth} data-lane={laneColor(topic.lane)}>
    {isRoot ? <div className="research-map-topic-content" title={topic.title}>
      {content}{summary && <RunSummary summary={summary} />}
    </div> :
      <button className="research-map-topic-content" type="button" title={topic.title}
        aria-label={topic.title} aria-description={roleLabel} aria-describedby={summary ? summaryId : undefined}
        onClick={() => navigate(topic.id)}>
        {content}{summary && <RunSummary summary={summary} descriptionId={summaryId} />}
      </button>}
  </div>;
}

function RunSummary({ summary: { run, score, best }, descriptionId }: { summary: ExperimentBranchSummary; descriptionId?: string }) {
  const { t, i18n } = useLingui();
  const status = useExperimentStatusLabel(run.status);
  const runDetail = run.status === "running" && run.completedCases !== null && run.totalCases !== null
    ? t`${run.id}: ${status}, ${run.completedCases} of ${run.totalCases} cases checked`
    : t`${run.id}: ${status}`;
  const outcomes: Record<ScoreOutcome, string> = {
    improved: t`Improved`, neutral: t`Neutral`, worse: t`Worse`, failed: t`Failed`,
  };
  const number = new Intl.NumberFormat(i18n.locale, { maximumSignificantDigits: 12 });
  const scoreDetail = score && t`Latest score (${score.id}): ${score.metric.name} ${number.format(score.metric.value)} vs ${number.format(score.metric.baseline)}`;
  const bestDetail = best && t`Best validated score (${best.id}): ${best.metric.value}`;
  const detail = [runDetail, scoreDetail, bestDetail, score?.metric.unit, score?.outcome && outcomes[score.outcome]].filter(Boolean).join(" · ");
  const short = score && new Intl.NumberFormat(i18n.locale, { maximumSignificantDigits: 6 }).format(score.metric.value);
  return <>
    <span className="research-map-run-summary" title={detail} aria-hidden="true">
      <span className="research-map-run-status" data-status={run.status}>{status}</span>
      {short && <span className="research-map-run-score">· {short}</span>}
      {best && best.id !== score?.id && <span className="research-map-run-score">{t`Best`} {number.format(best.metric.value)}</span>}
    </span>
    <span className="sr-only" id={descriptionId}>{detail}</span>
  </>;
}

const nodeTypes = { topic: TopicCard };

function viewportBounds({ transform: [x, y, zoom], width, height }: ReactFlowState) {
  return {
    left: Math.floor(-x / zoom / OVERSCAN) * OVERSCAN - OVERSCAN,
    right: Math.ceil((width - x) / zoom / OVERSCAN) * OVERSCAN + OVERSCAN,
    top: Math.floor(-y / zoom / OVERSCAN) * OVERSCAN - OVERSCAN,
    bottom: Math.ceil((height - y) / zoom / OVERSCAN) * OVERSCAN + OVERSCAN,
  };
}

type Bounds = ReturnType<typeof viewportBounds>;
function sameBounds(a: Bounds | null, b: Bounds | null) {
  return a === b || Boolean(a && b && a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom);
}

function intersects(a: Bounds, b: Bounds) {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
}

type CanvasProps = {
  topics: Topic[];
  summaries?: Record<string, ExperimentBranchSummary>;
  navigate: (id: string) => void;
};

export function MindMapCanvas(props: CanvasProps) {
  return <ReactFlowProvider><FlowCanvas {...props} /></ReactFlowProvider>;
}

function FlowCanvas({ topics, summaries, navigate }: CanvasProps) {
  const { t } = useLingui();
  const flow = useReactFlow<TopicNode>();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const ready = useStore((state) => state.panZoom !== null);
  const windowed = topics.length > WINDOW_NODE_COUNT;
  const windowBounds = useStore((state) => windowed ? viewportBounds(state) : null, sameBounds);
  const focusId = topics[0].id;
  const layout = useMemo(() => {
    const positions = placeTopics(topics);
    let left = -ROOT_WIDTH / 2;
    let right = ROOT_WIDTH / 2;
    let top = 0;
    let bottom = ROOT_HEIGHT;
    const cards = topics.map((topic, index) => {
      const isRoot = index === 0;
      const position = positions.get(topic.id)!;
      const width = isRoot ? ROOT_WIDTH : NODE_WIDTH;
      const height = isRoot ? ROOT_HEIGHT : NODE_HEIGHT;
      const bounds = { left: position.x, right: position.x + width, top: position.y, bottom: position.y + height };
      return { topic, isRoot, position, width, height, bounds };
    });
    for (const { bounds } of cards) {
      left = Math.min(left, bounds.left);
      right = Math.max(right, bounds.right);
      top = Math.min(top, bounds.top);
      bottom = Math.max(bottom, bounds.bottom);
    }
    return { cards, paths: getConnections(topics, positions), bounds: { x: left, y: top, width: right - left, height: bottom - top } };
  }, [topics]);

  const { bounds } = layout;
  useEffect(() => {
    if (!ready || width < 64 || height < 64) return;
    const fit = getViewportForBounds(bounds, width - 48, height - 48, 0.001, READING_ZOOM, 0);
    const next = fit.zoom >= MIN_ZOOM
      ? { x: fit.x + 24, y: fit.y + 24, zoom: fit.zoom }
      : { x: width / 2, y: height / 2 - ROOT_HEIGHT / 2 * READING_ZOOM, zoom: READING_ZOOM };
    void flow.setViewport(next);
  }, [bounds, flow, focusId, height, ready, width]);

  const nodes = useMemo<TopicNode[]>(() => layout.cards
    .filter(({ isRoot, bounds }) => !windowBounds || isRoot || intersects(bounds, windowBounds))
    .map(({ topic, isRoot, position, width, height }) => ({
      id: topic.id, type: "topic", position, width, height,
      // The card button handles navigation even though Flow cannot select or drag nodes.
      style: { pointerEvents: "auto" }, data: {
        topic, isRoot, navigate, summary: summaries && Object.hasOwn(summaries, topic.id) ? summaries[topic.id] : undefined,
      },
    })), [layout, navigate, summaries, windowBounds]);
  const paths = useMemo(() => {
    if (!windowBounds) return layout.paths;
    const nearbyTopics = new Set(nodes.map(({ id }) => id));
    // A wide branch can have hundreds of paths converging on the same root.
    return layout.paths.filter((path) => nearbyTopics.has(path.id) && intersects(path, windowBounds));
  }, [layout, nodes, windowBounds]);
  return <div className="research-map-canvas" aria-label={t`Mind map branches`}>
    <ReactFlow nodes={nodes} nodeTypes={nodeTypes} minZoom={MIN_ZOOM} maxZoom={2}
      panOnScroll zoomOnScroll={false} zoomOnDoubleClick={false} nodesDraggable={false}
      nodesConnectable={false} elementsSelectable={false} nodesFocusable={false} edgesFocusable={false}
      deleteKeyCode={null} proOptions={{ hideAttribution: true }}>
      <Background gap={22} size={1} color="var(--border-subtle)" />
      <ViewportPortal>
        <svg className="research-map-paths" aria-hidden="true" width="1" height="1">
          {paths.map(({ id, path, lane }) => <path key={id} d={path} data-lane={lane} />)}
        </svg>
      </ViewportPortal>
    </ReactFlow>
    <div className="research-map-zoom">
      <Button variant="ghost" size="compact" aria-label={t`Zoom out`} onClick={() => void flow.zoomOut()}>−</Button>
      <Button variant="ghost" size="compact" onClick={() => void flow.setCenter(0, ROOT_HEIGHT / 2, { zoom: READING_ZOOM })}>{t`Center branch`}</Button>
      <Button variant="ghost" size="compact" aria-label={t`Zoom in`} onClick={() => void flow.zoomIn()}>+</Button>
    </div>
  </div>;
}
