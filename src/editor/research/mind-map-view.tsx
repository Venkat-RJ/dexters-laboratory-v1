import { useCallback, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";
import { buttonClassName } from "../../components/ui/button-styles";
import { useExperimentBranchSummaries } from "./experiment-query";
import { MindMapCanvas } from "./mind-map-canvas";
import { projectTopics, type Topic } from "./mind-map-layout";
import { TopicSearch } from "./mind-map-search";
import { projectEvidencePath, type MindMapTopic } from "./research-documents";

type LevelCount = "1" | "2" | "all";

export function MindMapView({ root, topics, selectedId, select, openFile, openExperimentsForNode }: {
  root: string;
  topics: MindMapTopic[];
  selectedId?: string;
  select: (id: string) => void;
  openFile: (path: string) => void;
  openExperimentsForNode: (id: string) => void;
}) {
  const { t } = useLingui();
  const graph = useMemo(() => projectTopics(topics), [topics]);
  const topicHierarchy = useMemo(() => graph.map(({ id, depth }): [string, number] => [id, depth]), [graph]);
  const summaries = useExperimentBranchSummaries(root, topicHierarchy)?.value;
  const byId = useMemo(() => new Map(graph.map((topic) => [topic.id, topic])), [graph]);
  const focusRoot = (selectedId && byId.get(selectedId)) || graph[0];
  const crumbs: Topic[] = [];
  for (let parent = focusRoot.parent; parent;) {
    const topic = byId.get(parent)!;
    crumbs.unshift(topic);
    parent = topic.parent;
  }

  const [levels, setLevels] = useReducer((_: LevelCount, next: LevelCount) => next, "1");
  const [searching, setSearching] = useReducer((_: boolean, next: boolean) => next, false);
  const breadcrumbRef = useRef<HTMLElement>(null);
  const currentCrumbRef = useRef<HTMLSpanElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const navigate = useCallback((id: string) => {
    if (id === focusRoot.id) {
      currentCrumbRef.current?.focus({ preventScroll: true });
      return;
    }
    moveFocus.current = true;
    select(id);
  }, [focusRoot.id, select]);

  const visible = useMemo(() => {
    const start = graph.indexOf(focusRoot);
    const depthLimit = levels === "all" ? Infinity : Number(levels);
    const branch: Topic[] = [{ ...focusRoot, depth: 0, parent: undefined }];
    for (let index = start + 1; index < graph.length; index++) {
      const topic = graph[index];
      const depth = topic.depth - focusRoot.depth;
      if (depth <= 0) break;
      if (depth <= depthLimit) branch.push({ ...topic, depth });
    }
    return branch;
  }, [focusRoot, graph, levels]);

  useLayoutEffect(() => {
    const breadcrumbs = breadcrumbRef.current;
    if (breadcrumbs) breadcrumbs.scrollLeft = breadcrumbs.scrollWidth;
    if (moveFocus.current) {
      currentCrumbRef.current?.focus({ preventScroll: true });
      moveFocus.current = false;
    }
  }, [focusRoot.id]);

  const reference = focusRoot.reference ? projectEvidencePath(focusRoot.reference) : null;
  return <>
    <div className="research-document-tools">
      <nav ref={breadcrumbRef} className="research-map-breadcrumbs" aria-label={t`Mind map path`}>
        {crumbs.map((topic) => <div key={topic.id}>
          <Button variant="ghost" size="compact" onClick={() => navigate(topic.id)} title={topic.title}>{topic.title}</Button>
          <ChevronRight size={12} aria-hidden="true" />
        </div>)}
        <span ref={currentCrumbRef} tabIndex={-1} aria-current="location" title={focusRoot.title}>{focusRoot.title}</span>
      </nav>
      {reference && <Button variant="ghost" size="compact" onClick={() => openFile(reference)}>{t`Open source`}</Button>}
      <Button variant="secondary" size="compact" onClick={() => openExperimentsForNode(focusRoot.id)}>{t`View runs`}</Button>
    </div>
    <div className="research-map-workspace">
      <MindMapCanvas topics={visible} summaries={summaries} navigate={navigate} />
      <div className="research-map-controls">
        <select className="research-map-levels" aria-label={t`Visible levels`} value={levels}
          onChange={(event) => setLevels(event.target.value as LevelCount)}>
          <option value="1">{t`1 level`}</option>
          <option value="2">{t`2 levels`}</option>
          <option value="all">{t`All levels`}</option>
        </select>
        <button type="button" ref={searchButtonRef} className={buttonClassName({ variant: "secondary", size: "compact" })}
          aria-expanded={searching} onClick={() => setSearching(!searching)}>{t`Find topic`}</button>
      </div>
      {searching && <TopicSearch topics={graph} byId={byId} onChoose={({ id }) => {
        setSearching(false);
        navigate(id);
      }} onCancel={() => {
        setSearching(false);
        searchButtonRef.current?.focus();
      }} />}
    </div>
  </>;
}
