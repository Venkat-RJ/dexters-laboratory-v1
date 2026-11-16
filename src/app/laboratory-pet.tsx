import { useEffect, useReducer } from "react";
import { useLingui } from "@lingui/react/macro";
import { sharedSetting, useSharedSetting } from "../settings/shared-setting";
import { useResearchStatus } from "./use-research-status";
import "./laboratory-pet.css";

const visibility = sharedSetting("laboratory.pet.visible.v1", () => {
  try { return localStorage.getItem("laboratory.pet.visible.v1") !== "false"; } catch { return true; }
});
const scenes = ["idle", "walk-left", "chemistry", "walk-right", "robot"] as const;
const sceneDuration = [2800, 2200, 4600, 2200, 4600] as const;
const researchScenes: Record<string, typeof scenes[number]> = {
  "search-plan": "walk-right",
  "prior-knowledge": "walk-right",
  "mind-map": "robot",
  "mind-map-review": "robot",
  setup: "chemistry",
  experiments: "chemistry",
};

/** A small local companion with an autonomous loop of distinct activities. */
export function LaboratoryPet({ root, focusMode, working, openAgent }: {
  root: string; focusMode: boolean; working: boolean; openAgent: () => void;
}) {
  const { t } = useLingui();
  const research = useResearchStatus(root);
  const active = working || Boolean(research);
  const [visible, setVisible] = useSharedSetting(visibility);
  const [sceneIndex, setSceneIndex] = useReducer((index: number) => index + 1, 0);
  const [workIndex, setWorkIndex] = useReducer((index: number) => index + 1, 0);
  const [hovered, setHovered] = useReducer((_: boolean, value: boolean) => value, false);

  useEffect(() => {
    if (!visible || focusMode || active || hovered) return;
    const timeout = window.setTimeout(() => setSceneIndex(), sceneDuration[sceneIndex % scenes.length]);
    return () => window.clearTimeout(timeout);
  }, [sceneIndex, visible, focusMode, active, hovered]);

  useEffect(() => {
    if (!visible || focusMode || research || !working || hovered) return;
    const timeout = window.setTimeout(() => setWorkIndex(), 4600);
    return () => window.clearTimeout(timeout);
  }, [workIndex, visible, focusMode, research, working, hovered]);

  if (focusMode) return null;
  const scene = sceneIndex % scenes.length;
  const action = research ? researchScenes[research.stage] ?? "idle"
    : hovered ? "greet" : working ? (workIndex % 2 === 0 ? "chemistry" : "robot") : scenes[scene];
  const side = !active && (scene === 1 || scene === 2) ? "left" : "right";

  return <div className="laboratory-pet" data-action={action} data-side={side} data-working={active || undefined} data-hidden={!visible || undefined} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
    {visible ? <>
      {research && <span className="laboratory-pet-activity">{research.label}</span>}
      <button className="laboratory-pet-body" type="button" onClick={openAgent} aria-label={active ? t`Dexter is working. Open Dexter` : t`Open Dexter`} title={research?.label ?? (working ? t`Dexter is working` : t`Open Dexter`)}>
        <span className="laboratory-pet-sprite" aria-hidden="true" />
      </button>
      <button className="laboratory-pet-hide" type="button" aria-label={t`Hide pet`} title={t`Hide pet`} onClick={() => setVisible(false)}>×</button>
    </> : <button className="laboratory-pet-show" type="button" aria-label={t`Show pet`} title={t`Show pet`} onClick={() => setVisible(true)}>✦</button>}
  </div>;
}
