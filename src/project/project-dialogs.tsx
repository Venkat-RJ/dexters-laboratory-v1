import { Suspense } from "react";
import { useLingui } from "@lingui/react/macro";
import { Cloud, FileArchive, Folder, FolderOpen, GitBranch, Plus, Settings, Sparkles, Wrench } from "lucide-react";
import { MorphIcon, MotionButton } from "../components/ui/motion";
import { InfinityLoader } from "../components/ui/activity-icons";
import { buttonClassName } from "../components/ui/button-styles";
import type { ProjectVenue } from "../app-types";
import type { RecentProject } from "../settings/app-settings";
import { beginWindowDrag, titleBarDoubleClick } from "../app-utils";
import { mentionsAny } from "../platform/ipc-error-phrases";
import { LatticeMark } from "../components/ui/lattice-mark";
import { InlineMessage } from "../components/ui/inline-message";
import { ChunkGate } from "../components/chunk-gate";
import { chunk, lazyChunk } from "../lib/lazy-chunk";
import { WelcomeLattice } from "./welcome-lattice";
import { welcomeDeskProjects } from "./first-pages";
import { WelcomeDesk } from "./welcome-desk";

// The template form is only needed after New project is opened.
const loadCreateProject = chunk(() => import("./create-project-dialog"));
const LazyCreateProjectDialog = lazyChunk(loadCreateProject, (module) => module.CreateProjectDialog);

export function CreateProjectDialog(props: import("react").ComponentProps<typeof LazyCreateProjectDialog>) {
  return <Suspense fallback={null}><ChunkGate chunk={loadCreateProject}><LazyCreateProjectDialog {...props} /></ChunkGate></Suspense>;
}

/** A recent project launch could not reopen, with the backend's reason. */
export type UnopenedProject = RecentProject & { reason: string };

/* eslint-disable lingui/no-unlocalized-strings -- phrases matched in backend error text */
/** The backend's errors for a folder that is not there any more (project::classify_open_error's not_found). */
export const NO_SUCH_FILE = "no such file";
export const NOT_A_FOLDER = "not a folder";
/* eslint-enable lingui/no-unlocalized-strings */

function isMissingFolder(reason: string) {
  return mentionsAny(reason, [NO_SUCH_FILE, NOT_A_FOLDER]);
}

export function Welcome(props: {
  busyLabel: string | null;
  createOpen: boolean;
  createError: string | null;
  projectName: string;
  projectVenue: ProjectVenue;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  setProjectName: (value: string) => void;
  setProjectVenue: (value: ProjectVenue) => void;
  onCreate: () => void;
  onOpen: () => void;
  onImportZip: () => void;
  onClone: () => void;
  onOpenTutorial: () => void;
  /** Projects to reopen; `unopenedProject` is the one launch could not. */
  recentProjects: RecentProject[];
  unopenedProject: UnopenedProject | null;
  onRecent: (path: string) => void;
  onSettings: () => void;
  onInstallTex: () => void;
  onOpenOverleaf?: () => void;
}) {
  const { t } = useLingui();
  // The welcome screen lays out a few projects to reopen; the switcher in a project goes deeper.
  const recents = welcomeDeskProjects(props.recentProjects, props.unopenedProject?.path);
  const unopened = props.unopenedProject;
  const unopenedName = unopened?.name;
  const unopenedReason = unopened?.reason ?? "";
  return (
    <div className="welcome-screen">
      <div className="welcome-titlebar" onMouseDown={beginWindowDrag} onDoubleClick={titleBarDoubleClick}>
        <button className="icon-button" onClick={props.onSettings} title={t`Settings`}><Settings size={16} /></button>
      </div>
      <WelcomeLattice />
      <div className="welcome-content">
        <div className="brand-mark"><LatticeMark size={34} motion="weave" /></div>
        <h1>Dexter's Laboratory V1</h1>
        <div className="welcome-actions">
          <MotionButton
            className={buttonClassName({ variant: "primary" })}
            magnetic
            onClick={props.onOpenCreate}
          >
            <Plus size={17} /> {t`New project`}
          </MotionButton>
          <MotionButton
            className={buttonClassName({ variant: "secondary" })}
            onClick={props.onOpen}
          >
            <MorphIcon size={17} idle={<Folder size={17} />} hover={<FolderOpen size={17} />} />
            {t`Open folder`}
          </MotionButton>
          {/* welcome-tutorial: what scripts/linux-e2e.mjs presses to open the sample. */}
          <MotionButton
            className={buttonClassName({ variant: "ghost", className: "welcome-tutorial" })}
            disabled={Boolean(props.busyLabel)}
            onClick={props.onOpenTutorial}
          >
            <Sparkles size={17} /> {t`Guided tutorial`}
          </MotionButton>
        </div>
        {(unopenedName || recents.length > 0) && (
          <section className="welcome-recents" aria-label={t`Recent projects`}>
            {unopenedName && (
              <InlineMessage level="warning" className="welcome-unopened">
                {isMissingFolder(unopenedReason)
                  ? t`Couldn’t reopen “${unopenedName}”. Its folder may have been moved or renamed`
                  : t`Couldn’t reopen “${unopenedName}”: ${unopenedReason}`}
              </InlineMessage>
            )}
            {recents.length > 0 && (
              <WelcomeDesk projects={recents} disabled={Boolean(props.busyLabel)} onOpen={props.onRecent} />
            )}
          </section>
        )}
        <div className="welcome-more">
          <button className="welcome-more-action" onClick={props.onClone}>
            <GitBranch size={15} /> {t`Clone repository`}
          </button>
          {props.onOpenOverleaf && (
            <button className="welcome-more-action" onClick={props.onOpenOverleaf}>
              <Cloud size={15} /> {t`Open from Overleaf`}
            </button>
          )}
          <button className="welcome-more-action" onClick={props.onImportZip}>
            <FileArchive size={15} /> {t`Import ZIP`}
          </button>
          <button className="welcome-more-action" onClick={props.onInstallTex}>
            <Wrench size={15} /> {t`Install LaTeX tools`}
          </button>
        </div>
        {props.busyLabel && <p className="busy-label"><InfinityLoader size={15} /> {props.busyLabel}</p>}
      </div>
      {props.createOpen && (
        <CreateProjectDialog
          projectName={props.projectName}
          setProjectName={props.setProjectName}
          projectVenue={props.projectVenue}
          setProjectVenue={props.setProjectVenue}
          error={props.createError}
          onCreate={props.onCreate}
          onClose={props.onCloseCreate}
        />
      )}
    </div>
  );
}
