import { act, renderHook } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { expect, it, vi } from "vitest";
import { useProjectText } from "./research-links";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../project/project-files-changed", () => ({
  changesReach: vi.fn(),
  onProjectFilesChanged: () => () => {},
}));

it("refreshes a visible receipt through a continuous burst of writes", async () => {
  vi.useFakeTimers();
  const path = "experiments/E-001/run-status.json";
  vi.mocked(invoke).mockRejectedValueOnce(`${path} is not in the project folder.`)
    .mockResolvedValueOnce("running").mockResolvedValueOnce("completed");
  const { result, unmount } = renderHook(() => useProjectText("/project", path, 2000));
  try {
    await act(async () => {});
    expect(result.current).toMatchObject({ source: null, failed: false });

    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(result.current?.source).toBe("running");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(result.current?.source).toBe("completed");

    unmount();
    await vi.advanceTimersByTimeAsync(2000);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenLastCalledWith("read_project_file", { projectRoot: "/project", path });
  } finally {
    unmount();
    vi.useRealTimers();
  }
});
