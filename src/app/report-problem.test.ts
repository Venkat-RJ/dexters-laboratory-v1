import { afterEach, describe, expect, it, vi } from "vitest";
import { addAppLog, clearAppLogs } from "../telemetry/app-log-store";
import { createAppLogExport } from "../telemetry/app-log-export";
import { reportProblem } from "./report-problem";

const tauri = vi.hoisted(() => ({ invoke: vi.fn(), openUrl: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauri.invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: tauri.openUrl }));

afterEach(() => {
  tauri.invoke.mockReset();
  tauri.openUrl.mockReset();
  clearAppLogs();
});

describe("Help ▸ Report a Problem…", () => {
  it("saves a redacted local export without opening an upstream issue", async () => {
    addAppLog({ level: "error", source: "Build", title: "Build failed", detail: "Undefined control sequence in /Users/me/secret-paper.tex", toast: false });
    tauri.invoke.mockResolvedValue({ osVersion: "15.1", arch: "aarch64" });
    await reportProblem();

    const [command, args] = tauri.invoke.mock.calls[0] as [string, { contents: string }];
    expect(command).toBe("save_problem_report");
    const saved = JSON.parse(args.contents) as ReturnType<typeof createAppLogExport>;
    expect(saved.includes_raw_diagnostic).toBe(false);
    expect(args.contents).not.toContain("secret-paper");
    expect(tauri.openUrl).not.toHaveBeenCalled();
  });

  it("opens nothing when the log could not be saved, and says why", async () => {
    tauri.invoke.mockRejectedValue(new Error("Could not create the report folder: permission denied"));
    await reportProblem();
    expect(tauri.openUrl).not.toHaveBeenCalled();
  });
});
