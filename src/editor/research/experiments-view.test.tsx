import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { afterEach, expect, it, vi } from "vitest";
import { ExperimentNoteHeader } from "./experiments-view";
import { ResearchDocument } from "./research-document";
import { EXPERIMENT_BRANCH_SELECTION, EXPERIMENTS_PATH, MIND_MAP_PATH } from "./research-documents";
import { selectResearchItem } from "./research-links";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((command, args) => {
    if (args.projectRoot === "/failed-launch" && args.path === "experiments/E-002/launch-status.json") {
      return Promise.resolve(JSON.stringify({ status: "failed", reason: "Interpreter startup timed out.", exitCode: 124 }));
    }
    if (command !== "query_experiments") return Promise.reject(`${args.path} is not in the project folder.`);
    const rows = JSON.parse(source).experiments.map((row: { id: string; title: string; nodeId: string }) => ({
      id: row.id, title: row.title, nodeId: row.nodeId, status: "planned",
      totalCases: null, completedCases: null, updatedAt: null, metric: null, outcome: null,
    }));
    return Promise.resolve({ counts: { all: 2, active: 2, attention: 0 }, total: 2, offset: 0, rows });
  }),
}));
vi.mock("../../project/project-files-changed", () => ({
  changesReach: vi.fn(),
  onProjectFilesChanged: () => () => {},
}));

afterEach(cleanup);

const source = JSON.stringify({
  version: 1,
  experiments: [
    { id: "E-001", title: "Border check", hypothesis: "A border fits." },
    { id: "E-002", title: "Clearance check", hypothesis: "A small clearance helps." },
  ].map((row) => ({ ...row, nodeId: "packing", baseline: "Saved layouts", success: "Smaller side", plan: "plan.tex" })),
});

const preview = (root: string, openFile = vi.fn()) => (
  <ResearchDocument path={EXPERIMENTS_PATH} root={root} source={source}
    openFile={openFile} sourceEditor={null} />
);

it("drills into a branch, goes back by breadcrumb, and requests runs for the whole branch", async () => {
  const root = "/map-drill-down";
  const map = JSON.stringify({ version: 1, topics: [
    { id: "packing", label: "Packing", depth: 0 },
    { id: "border", label: "Border", depth: 1 },
    { id: "dilation", label: "Dilation", depth: 2 },
    { id: "certificate", label: "Certificate", depth: 3 },
    { id: "controls", label: "Controls", depth: 1 },
  ] });
  const mock = vi.mocked(invoke);
  const previous = mock.getMockImplementation()!;
  mock.mockImplementation((command, args) => {
    if (command === "read_project_file" && (args as { path?: string })?.path === MIND_MAP_PATH) {
      return Promise.resolve(map) as never;
    }
    return previous(command, args);
  });
  try {
    const openFile = vi.fn();
    const view = render(<ResearchDocument path={MIND_MAP_PATH} root={root} source={map}
      openFile={openFile} sourceEditor={null} />);
    const breadcrumbs = within(screen.getByRole("navigation", { name: "Mind map path" }));
    const levels = screen.getByRole("combobox", { name: "Visible levels" });
    expect(screen.queryByRole("button", { name: "Dilation" })).not.toBeInTheDocument();
    fireEvent.change(levels, { target: { value: "2" } });
    expect(screen.getByRole("button", { name: "Dilation" })).toBeVisible();
    fireEvent.change(levels, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Border" }));
    expect(screen.queryByRole("button", { name: "Controls" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dilation" }));
    expect(breadcrumbs.getByText("Dilation")).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("button", { name: "Certificate" })).toBeVisible();
    fireEvent.click(breadcrumbs.getByRole("button", { name: "Border" }));
    expect(screen.queryByRole("button", { name: "Certificate" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View runs" }));
    expect(openFile).toHaveBeenCalledWith(EXPERIMENTS_PATH);
    view.unmount();

    render(preview(root));
    await screen.findByRole("table", { name: "Experiments list" });
    expect(screen.getByRole("combobox", { name: "Research branch" })).toHaveValue("border");
    expect(invoke).toHaveBeenCalledWith("query_experiments", {
      projectRoot: root,
      query: expect.objectContaining({ nodeId: "border", descendantNodeIds: ["dilation", "certificate"], view: "all" }),
    });
  } finally {
    mock.mockImplementation(previous);
  }
});

it("limits rendered siblings and finds topics off the canvas and at maximum depth", () => {
  const root = "/large-map";
  const map = JSON.stringify({ version: 1, topics: [
    { id: "root", label: "Research", depth: 0 },
    { id: "wide", label: "Wide branch", depth: 1 },
    ...Array.from({ length: 1000 }, (_, index) => ({ id: `sibling-${index}`, label: `Sibling ${index + 1}`, depth: 2 })),
    ...Array.from({ length: 32 }, (_, index) => ({ id: `step-${index}`, label: `Step ${index + 1}`, depth: index + 1 })),
  ] });
  render(<ResearchDocument path={MIND_MAP_PATH} root={root} source={map} openFile={vi.fn()} sourceEditor={null} />);
  const breadcrumbs = within(screen.getByRole("navigation", { name: "Mind map path" }));
  fireEvent.click(screen.getByRole("button", { name: "Wide branch" }));
  const siblingCount = screen.getAllByRole("button", { name: /^Sibling / }).length;
  expect(siblingCount).toBeLessThan(100);
  const find = (title: string) => {
    fireEvent.click(screen.getByRole("button", { name: "Find topic" }));
    const field = screen.getByRole("textbox", { name: "Find topic" });
    fireEvent.change(field, { target: { value: title } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(breadcrumbs.getByText(title)).toHaveAttribute("aria-current", "location");
  };
  find("Sibling 1000");
  find("Step 32");
  expect(breadcrumbs.getAllByRole("button")).toHaveLength(32);
  fireEvent.click(breadcrumbs.getByRole("button", { name: "Step 31" }));
  expect(breadcrumbs.getByText("Step 31")).toHaveAttribute("aria-current", "location");
});

it("opens on the list, then reveals a plan when its row is chosen", async () => {
  render(preview("/list-project"));
  const list = await screen.findByRole("table", { name: "Experiments list" });
  expect(within(list).getAllByRole("button")).toHaveLength(2);
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(within(list).getAllByText("Planned")).toHaveLength(2);
  fireEvent.click(within(list).getByRole("button", { name: /Clearance check/ }));
  expect(screen.getByRole("heading", { name: "Clearance check" })).toBeInTheDocument();
  expect(screen.getByText("A small clearance helps.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "All experiments" }));
  expect(await screen.findByRole("table", { name: "Experiments list" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Find experiment" })).toHaveFocus();
  await screen.findAllByText("Planned");
});

it("follows a requested experiment once and shows the list on a normal reopen", async () => {
  const root = "/linked-project";
  selectResearchItem({ root, path: EXPERIMENTS_PATH, id: "E-002" });
  const first = render(preview(root));
  expect(screen.getByRole("heading", { name: "Clearance check" })).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "Experiments list" })).not.toBeInTheDocument();
  await screen.findByText("Planned");
  first.unmount();
  render(preview(root));
  expect(await screen.findByRole("table", { name: "Experiments list" })).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  await screen.findAllByText("Planned");
});

it("shows the observed reason and opens the report when startup failed before a run receipt", async () => {
  const root = "/failed-launch";
  const openFile = vi.fn();
  selectResearchItem({ root, path: EXPERIMENTS_PATH, id: "E-002" });
  render(preview(root, openFile));
  expect(await screen.findByText("Interpreter startup timed out.")).toBeVisible();
  expect(within(screen.getByRole("article")).getByText("Failed", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Launch report" }));
  expect(openFile).toHaveBeenCalledWith("experiments/E-002/launch-status.json");
});

it("opens a requested branch from details and clears the previous retry family", async () => {
  const root = "/branch-navigation";
  selectResearchItem({ root, path: EXPERIMENTS_PATH, id: "E-002" });
  render(preview(root));
  await screen.findByText("Planned");
  fireEvent.click(screen.getByRole("button", { name: "Related attempts" }));
  let list = await screen.findByRole("table", { name: "Experiments list" });
  fireEvent.click(within(list).getByRole("button", { name: /Clearance check/ }));
  await screen.findByText("Planned");
  act(() => selectResearchItem({ root, path: EXPERIMENT_BRANCH_SELECTION, id: "packing" }));
  list = await screen.findByRole("table", { name: "Experiments list" });
  expect(list).toBeVisible();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Clear related attempts" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Research branch" })).toHaveValue("packing");
  expect(invoke).toHaveBeenCalledWith("query_experiments", {
    projectRoot: root,
    query: expect.objectContaining({ nodeId: "packing", relatedTo: undefined, view: "all", offset: 0 }),
  });
});


it("opens an existing Markdown note through the normal document host and clears the detail selection", async () => {
  const mock = vi.mocked(invoke);
  const previous = mock.getMockImplementation()!;
  mock.mockImplementation((command, args) => {
    if (command === "read_project_file" && (args as { path?: string } | undefined)?.path === "experiments/E-002/experiment.md") return Promise.resolve("# Saved human note") as never;
    return previous(command, args);
  });
  try {
    const openFile = vi.fn();
    render(preview("/note-project", openFile));
    fireEvent.click(within(await screen.findByRole("table", { name: "Experiments list" })).getByRole("button", { name: /Clearance check/ }));
    await vi.waitFor(() => expect(openFile).toHaveBeenCalledWith("experiments/E-002/experiment.md"));
    expect(await screen.findByRole("table", { name: "Experiments list" })).toBeVisible();
    expect(mock).not.toHaveBeenCalledWith("write_project_file", expect.objectContaining({ projectRoot: "/note-project" }));
  } finally { mock.mockImplementation(previous); }
});

it("keeps receipt progress above the note and navigates back to its map topic", async () => {
  const mock = vi.mocked(invoke);
  const previous = mock.getMockImplementation()!;
  mock.mockImplementation((command, args) => {
    if (command === "read_project_file" && (args as { path?: string } | undefined)?.path === "experiments.json") return Promise.resolve(source) as never;
    if (command === "read_project_file" && (args as { path?: string } | undefined)?.path === "experiments/E-002/run-status.json") return Promise.resolve(JSON.stringify({
      status: "running", elapsedSeconds: 3, limitSeconds: 90, updatedAt: Date.now() / 1000,
      completedCases: 2, activeCase: "control", results: [],
    })) as never;
    return previous(command, args);
  });
  try {
    const openFile = vi.fn();
    render(<ExperimentNoteHeader root="/header-project" id="E-002" openFile={openFile} />);
    expect(await screen.findByText("Checking control")).toBeVisible();
    expect(screen.getByText(/2 cases checked/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mind map" }));
    expect(openFile).toHaveBeenCalledWith("mind-map.json");
    fireEvent.click(screen.getByRole("button", { name: "All experiments" }));
    expect(openFile).toHaveBeenCalledWith("experiments.json");
  } finally { mock.mockImplementation(previous); }
});

it("creates a legacy note with an expected-content check before opening it", async () => {
  const mock = vi.mocked(invoke);
  const previous = mock.getMockImplementation()!;
  mock.mockImplementation((command, args) => {
    if (command === "create_project_entry") return Promise.resolve("experiments/E-002/experiment.md") as never;
    if (command === "write_project_file") return Promise.resolve({}) as never;
    return previous(command, args);
  });
  try {
    const openFile = vi.fn();
    render(preview("/create-note", openFile));
    fireEvent.click(within(await screen.findByRole("table", { name: "Experiments list" })).getByRole("button", { name: /Clearance check/ }));
    const create = await screen.findByRole("button", { name: "Create experiment note" });
    await vi.waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    await vi.waitFor(() => expect(openFile).toHaveBeenCalledWith("experiments/E-002/experiment.md"));
    expect(mock).toHaveBeenCalledWith("write_project_file", expect.objectContaining({
      projectRoot: "/create-note", path: "experiments/E-002/experiment.md", expectedContent: "# Notes\n",
      content: expect.stringContaining("A small clearance helps."),
    }));
  } finally { mock.mockImplementation(previous); }
});

it("shows a validated scoreless setup separately from unverified legacy results", async () => {
  const mock = vi.mocked(invoke);
  const previous = mock.getMockImplementation()!;
  mock.mockImplementation((command, args) => {
    if (command === "query_experiments") return Promise.resolve({
      counts: { all: 2, active: 0, attention: 0 }, total: 2, offset: 0,
      rows: ["passed", null].map((validation, index) => ({
        id: `S-${index}`, title: index ? "Legacy check" : "Setup controls", nodeId: "packing",
        status: "completed", validation, metric: null, outcome: null,
        totalCases: null, completedCases: 2, updatedAt: null,
      })),
    }) as never;
    return previous(command, args);
  });
  try {
    render(preview("/setup-scoreless"));
    const table = await screen.findByRole("table", { name: "Experiments list" });
    expect(within(table).getByText("Validated")).toBeVisible();
    expect(within(table).getByText("Unverified")).toBeVisible();
  } finally {
    mock.mockImplementation(previous);
  }
});
