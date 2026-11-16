// Public V1 saves a local report. No upstream issue is opened automatically.
import { invoke } from "@tauri-apps/api/core";
import { msg } from "@lingui/core/macro";
import { toMessage } from "../app-utils";
import { i18n } from "../i18n";
import { addAppLog, getAppLogEntries } from "../telemetry/app-log-store";
import { createAppLogExport } from "../telemetry/app-log-export";
import { getKnownUpdate } from "../telemetry/outdated-version";

export async function reportProblem(): Promise<void> {
  const update = getKnownUpdate();
  if (!update) return fileReport();
  const { running, latest } = update;
  addAppLog({
    level: "warning",
    source: i18n._(msg`Report a problem`),
    title: i18n._(msg`You’re on v${running}; v${latest} is available`),
    detail: i18n._(msg`It may already fix this. Update first, or report the problem anyway.`),
    dedupeKey: "report-problem-outdated",
    toastOptions: {
      timeoutMs: 0,
      primaryAction: { label: i18n._(msg`Update now`), onClick: update.updateNow },
      secondaryAction: { label: i18n._(msg`Report anyway`), onClick: fileReport },
    },
  });
}

async function fileReport(): Promise<void> {
  const contents = JSON.stringify(createAppLogExport(getAppLogEntries()), null, 2);
  try {
    await invoke("save_problem_report", { contents });
  } catch (reason) {
    addAppLog({
      level: "error", source: i18n._(msg`Report a problem`), title: i18n._(msg`Couldn’t save the diagnostic log`), detail: toMessage(reason),
    });
    return;
  }
  addAppLog({
    level: "info",
    source: i18n._(msg`Report a problem`),
    title: i18n._(msg`Diagnostic log saved`),
    detail: i18n._(msg`Review the saved file before sharing it with the project maintainer.`),
  });
}
