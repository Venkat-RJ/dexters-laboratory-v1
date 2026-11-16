import { invoke } from "@tauri-apps/api/core";
import { useEffect, useReducer, useSyncExternalStore } from "react";
import { changesReach, onProjectFilesChanged } from "../../project/project-files-changed";

type Selection = { root: string; path: string; id: string };
const selectionEvents = new EventTarget();
let activeRoot = "";
const selections = new Map<string, Selection>();
function subscribe(listener: () => void) {
  selectionEvents.addEventListener("select", listener);
  return () => selectionEvents.removeEventListener("select", listener);
}
export function selectResearchItem(next: Selection) {
  if (activeRoot !== next.root) {
    activeRoot = next.root;
    selections.clear();
  }
  selections.set(next.path, { ...next });
  selectionEvents.dispatchEvent(new Event("select"));
}
export function clearResearchItem({ root, path, id }: Selection) {
  if (activeRoot !== root || selections.get(path)?.id !== id) return;
  selections.delete(path);
  selectionEvents.dispatchEvent(new Event("select"));
}
// Keep the request identity so opening the same node again still navigates.
export function useResearchRequest(root: string, path: string) {
  return useSyncExternalStore(subscribe, () => activeRoot === root ? selections.get(path) : undefined);
}

type Read = { root: string; path: string; source: string | null; failed: boolean };
export function useProjectText(root: string, path: string, refreshInterval?: number) {
  const [read, setRead] = useReducer((current: Read | null, next: Read) => (
    current?.root === next.root && current.path === next.path
      && current.source === next.source && current.failed === next.failed ? current : next
  ), null);
  useEffect(() => {
    if (!root || !path) return;
    let revision = 0;
    let disposed = false;
    function refresh() {
      revision += 1;
      const request = revision;
      void invoke<string>("read_project_file", { projectRoot: root, path }).then(
        (source) => {
          if (!disposed && request === revision) setRead({ root, path, source, failed: false });
        },
        (error: unknown) => {
          if (disposed || request !== revision) return;
          const message = String(error);
          const missing = message === `${path} is not in the project folder.`
            || message === "That file or folder no longer exists.";
          setRead({ root, path, source: null, failed: !missing });
        },
      );
    }
    const unsubscribe = onProjectFilesChanged(root, (paths) => {
      if (changesReach(paths, path)) refresh();
    });
    refresh();
    // The project watcher batches continuous writes for up to 30 seconds.
    // Read only the visible receipts between those batches.
    const timer = refreshInterval ? window.setInterval(() => {
      if (document.visibilityState !== "hidden") refresh();
    }, refreshInterval) : undefined;
    return () => {
      disposed = true;
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [root, path, refreshInterval]);
  return read?.root === root && read.path === path ? read : null;
}
