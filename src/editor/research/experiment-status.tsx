import type { ExperimentStatus as Status } from "./experiment-query";
import { useExperimentStatusLabel } from "./experiment-status-label";

export function ExperimentStatus({ status }: { status?: Status }) {
  const label = useExperimentStatusLabel(status);
  return <span className="research-status" data-status={status}>{label}</span>;
}
