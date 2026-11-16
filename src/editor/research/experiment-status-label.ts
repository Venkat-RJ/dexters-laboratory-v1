import { useLingui } from "@lingui/react/macro";
import type { ExperimentStatus as Status } from "./experiment-query";

export function useExperimentStatusLabel(status?: Status) {
  const { t } = useLingui();
  const labels = {
    planned: t`Planned`, queued: t`Queued`, running: t`Running`, completed: t`Completed`,
    failed: t`Failed`, timed_out: t`Time limit reached`, interrupted: t`Interrupted`,
    stale: t`Updates interrupted`, unavailable: t`Status unavailable`,
  };
  return status ? labels[status] : t`Loading status`;
}
