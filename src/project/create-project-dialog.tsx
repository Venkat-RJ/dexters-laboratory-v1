import { Suspense } from "react";
import { useLingui } from "@lingui/react/macro";
import { MotionButton } from "../components/ui/motion";
import { Button } from "../components/ui/button";
import { buttonClassName } from "../components/ui/button-styles";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import type { ProjectVenue } from "../app-types";
import { ModalDialog } from "../components/ui/modal-dialog";
import { ChunkGate } from "../components/chunk-gate";
import { chunk, lazyChunk } from "../lib/lazy-chunk";
import { PROJECT_VENUES } from "./project-venues";

const loadLocalTemplates = chunk(() => import("./local-templates"));
const LocalTemplates = lazyChunk(loadLocalTemplates, (module) => module.LocalTemplates);

export function CreateProjectDialog(props: {
  currentProject?: boolean;
  projectName: string;
  setProjectName: (value: string) => void;
  projectVenue: ProjectVenue;
  setProjectVenue: (value: ProjectVenue) => void;
  error: string | null;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <ModalDialog label={t`Create a research project`} onClose={props.onClose}>
      <div className="modal create-project-modal">
        <h2>{t`Create a research project`}</h2>
        <label>
          {t`Project name`}
          <Input autoFocus value={props.projectName} placeholder={t`Untitled research`} onChange={(event) => props.setProjectName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && props.onCreate()} />
        </label>
        <div className="venue-picker">
          <span className="venue-picker-label">{t`Venue template`}</span>
          <Select
            value={props.projectVenue.startsWith("local:") ? "" : props.projectVenue}
            onValueChange={(value) => props.setProjectVenue(value as ProjectVenue)}
          >
            <SelectTrigger aria-label={t`Venue template`}>
              <SelectValue placeholder={t`Choose a built-in template`} />
            </SelectTrigger>
            <SelectContent className="venue-picker-content" position="popper" align="start">
              <SelectItem value="research">{t`Research workspace`}</SelectItem>
              <SelectItem value="blank">{t`Blank article`}</SelectItem>
              <SelectItem value="chinese-article">{t`Chinese article (ctexart)`}</SelectItem>
              {PROJECT_VENUES.map(({ id, label: name, edition, preprint, rebuttal }) => (
                // The trigger shows the chosen item, so its edition and draft
                // mode are part of the name: ICLR's and CVPR's styles have no
                // preprint mode, a rebuttal is named apart from its paper, a
                // thesis is named by its university, and the IEEE and ACM
                // templates by their publisher and format.
                <SelectItem key={id} value={id}>
                  {id === "thuthesis" ? t`Tsinghua University thesis (${name})`
                    : id === "ustcthesis" ? t`USTC thesis (${name})`
                    : id === "ieee-conference" ? t`IEEE conference paper (${name})`
                    : id === "ieee-journal" ? t`IEEE journal article (${name})`
                    : id === "acm" ? t`ACM paper (${name})`
                    : rebuttal ? t`${name} ${edition} Rebuttal`
                    : edition === undefined ? t`${name} (preprint)`
                    : preprint ? t`${name} ${edition} (preprint)` : t`${name} ${edition}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Suspense fallback={null}>
          <ChunkGate chunk={loadLocalTemplates}>
            <LocalTemplates selected={props.projectVenue} onSelect={props.setProjectVenue} currentProject={props.currentProject} />
          </ChunkGate>
        </Suspense>
        {props.error && <p className="field-error" role="alert">{props.error}</p>}
        <div className="modal-actions">
          <Button variant="ghost" onClick={props.onClose}>{t`Cancel`}</Button>
          <MotionButton className={buttonClassName({ variant: "primary" })} onClick={props.onCreate}>{t`Choose location`}</MotionButton>
        </div>
      </div>
    </ModalDialog>
  );
}
