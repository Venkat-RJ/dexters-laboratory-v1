import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { watchCampaign } from "./campaign-continuation";

vi.mock("@tauri-apps/api/core", () => ({invoke: vi.fn()}));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); document.body.replaceChildren(); });

it("continues once per decision in the recorded idle workspace and respects waiting", async () => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockResolvedValue({ok: true, campaign: {
    id: "campaign", status: "running", agentThreadId: "thread", decisionRevision: 2,
    runningCount: 0, queuedCount: 0, verificationCount: 0,
  }});
  const context = {current: {threadId: "thread", workspaceRoot: "/project", state: "waiting"}};
  const post = vi.fn().mockResolvedValue(undefined);
  const cleanup = watchCampaign(context, {current: "/project"}, post);
  await vi.advanceTimersByTimeAsync(2000);
  expect(post).not.toHaveBeenCalled();
  context.current.state = "idle";
  await vi.advanceTimersByTimeAsync(6000);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith(expect.objectContaining({workspaceRoot: "/project", requestId: "campaign-campaign:2"}));
  cleanup();
});

it("stops only for the matching embedded frame and conversation", async () => {
  vi.useFakeTimers();
  const frame = document.createElement("iframe");
  frame.src = "http://localhost:4567/thread";
  document.body.append(frame);
  vi.mocked(invoke).mockResolvedValue({ok: true});
  const cleanup = watchCampaign({current: {threadId: "thread", workspaceRoot: "/project", state: "running"}}, {current: "/project"}, vi.fn());
  const data = {type: "synara:campaign-stop", workspaceRoot: "/project", threadId: "thread"};
  window.dispatchEvent(new MessageEvent("message", {data, source: window, origin: "http://localhost:4567"}));
  expect(invoke).not.toHaveBeenCalled();
  window.dispatchEvent(new MessageEvent("message", {data, source: frame.contentWindow, origin: "http://localhost:4567"}));
  expect(invoke).toHaveBeenCalledWith("research_campaign", expect.objectContaining({request: expect.objectContaining({action: "stop"})}));
  cleanup();
});


it("waits for validation, continues a later batch once, and does not revive stopped work", async () => {
  vi.useFakeTimers();
  const campaign = {id: "campaign", status: "running", agentThreadId: "thread", decisionRevision: 1,
    runningCount: 0, queuedCount: 0, verificationCount: 1};
  vi.mocked(invoke).mockImplementation(async () => ({ok: true, campaign: {...campaign}}));
  const context = {current: {threadId: "thread", workspaceRoot: "/project", state: "idle"}};
  const post = vi.fn().mockResolvedValue(undefined);
  const cleanup = watchCampaign(context, {current: "/project"}, post);
  await vi.advanceTimersByTimeAsync(2000);
  expect(post).not.toHaveBeenCalled();
  campaign.verificationCount = 0;
  await vi.advanceTimersByTimeAsync(4000);
  expect(post).toHaveBeenCalledTimes(1);
  campaign.queuedCount = 1;
  campaign.decisionRevision = 2;
  await vi.advanceTimersByTimeAsync(2000);
  expect(post).toHaveBeenCalledTimes(1);
  campaign.queuedCount = 0;
  await vi.advanceTimersByTimeAsync(4000);
  expect(post).toHaveBeenCalledTimes(2);
  campaign.status = "stopped";
  campaign.decisionRevision = 3;
  await vi.advanceTimersByTimeAsync(4000);
  expect(post).toHaveBeenCalledTimes(2);
  cleanup();
});
