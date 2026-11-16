import { createElement, type ComponentProps } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as modules from "./canvas-lazy-modules";
import { DeferredVisualMarkdownEditor } from "./canvas-lazy-editors";

vi.mock("../lib/lazy-chunk", async (original) => ({
  ...await original<typeof import("../lib/lazy-chunk")>(),
  lazyChunk: () => () => <p>Markdown editor loaded</p>,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("opens a cold Markdown editor even when animation frames are withheld", async () => {
  vi.useFakeTimers();
  vi.spyOn(modules, "isVisualMarkdownEditorWarmed").mockReturnValue(false);
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  render(createElement(DeferredVisualMarkdownEditor, {} as ComponentProps<typeof DeferredVisualMarkdownEditor>));
  expect(screen.queryByText("Markdown editor loaded")).not.toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(screen.getByText("Markdown editor loaded")).toBeVisible();
});
