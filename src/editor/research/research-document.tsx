import { useLayoutEffect, useMemo, useReducer, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { Button } from "../../components/ui/button";
import { InlineMessage } from "../../components/ui/inline-message";
import { EXPERIMENT_BRANCH_SELECTION, EXPERIMENTS_PATH, MIND_MAP_PATH, parseExperiments, parseMindMap } from "./research-documents";
import { clearResearchItem, selectResearchItem, useResearchRequest } from "./research-links";
import { ChartsView } from "./charts-view";
import { MindMapView } from "./mind-map-view";
import { ExperimentsView } from "./experiments-view";
import "./research-document.css";

export function ResearchDocument({ path, root, source, openFile, sourceEditor }: {
  path: string;
  root: string;
  source: string;
  openFile: (path: string) => void;
  sourceEditor: ReactNode;
}) {
  const { t } = useLingui();
  const isMap = path === MIND_MAP_PATH;
  const selection = useResearchRequest(root, path);
  const branchRequest = useResearchRequest(root, EXPERIMENT_BRANCH_SELECTION);
  const selectedId = selection?.id;
  const requestedBranch = branchRequest?.id;
  const [branch, changeBranch] = useReducer((_: string, next: string) => next, "");
  const [showCharts, setCharts] = useReducer((_: boolean, next: boolean) => next, false);
  const [showSource, setSource] = useReducer((_: boolean, next: boolean) => next, false);
  useLayoutEffect(() => {
    if (!selection) return;
    setCharts(false);
    setSource(false);
    if (isMap) changeBranch(selection.id);
  }, [selection, isMap]);
  useLayoutEffect(() => {
    if (isMap || !branchRequest) return;
    changeBranch(branchRequest.id);
    setCharts(false);
    setSource(false);
    clearResearchItem(branchRequest);
  }, [branchRequest, isMap]);
  const topics = useMemo(() => isMap ? parseMindMap(source) : null, [isMap, source]);
  const experiments = useMemo(() => isMap ? null : parseExperiments(source), [isMap, source]);
  const open = (target: string, id: string) => {
    selectResearchItem({ root, path: target, id });
    openFile(target);
  };
  const select = (id: string) => selectResearchItem({ root, path, id });
  const invalid = !topics && !experiments;
  const title = isMap ? t`Mind map` : t`Design of Experiments`;
  return <section className="research-document" aria-label={title}>
    <header className="research-document-header">
      <h2>{showCharts ? t`Charts` : title}</h2>
      <Button variant="ghost" size="compact" onClick={() => setCharts(!showCharts)}>{showCharts ? title : t`Charts`}</Button>
      {!invalid && <Button variant="ghost" size="compact" onClick={() => { setCharts(false); setSource(!showSource); }}>
        {showSource ? t`Show visual view` : t`Show source`}
      </Button>}
    </header>
    {invalid && <InlineMessage level="warning">{isMap ? t`The mind map file is invalid.` : t`The experiment list file is invalid.`}</InlineMessage>}
    {showCharts ? <ChartsView root={root} openFile={openFile} openNode={(id) => open(MIND_MAP_PATH, id)} /> : invalid || showSource ? sourceEditor : topics ?
      <MindMapView root={root} topics={topics} selectedId={selectedId} select={select} openFile={openFile}
        openExperimentsForNode={(id) => {
          selectResearchItem({ root, path: EXPERIMENT_BRANCH_SELECTION, id });
          openFile(EXPERIMENTS_PATH);
        }} /> :
      <ExperimentsView experiments={experiments!} root={root} branch={branch} changeBranch={changeBranch} requestedId={selectedId} requestedBranch={requestedBranch} openFile={openFile}
        openNode={(id) => open(MIND_MAP_PATH, id)} />}
  </section>;
}

export { ExperimentNoteHeader } from "./experiments-view";
