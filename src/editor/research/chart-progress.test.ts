import { expect, it } from "vitest";
import { chartProgress, type ChartRow } from "./chart-progress";
const row = (id: string, value: number, extra: Partial<ChartRow> = {}): ChartRow => ({
  id, title: id, nodeId: "squares", status: "completed", validation: "passed",
  evaluation: "portfolio-v1", direction: "lower", updatedAt: 1, scoreOutcome: "improved",
  metric: {name: "Overall competition score", value, baseline: 23}, ...extra,
});
it("keeps every attempt in journal order and best-so-far through failures and worse scores", () => {
  const result = chartProgress([row("A",22.3,{updatedAt:100}),row("B",0,{status:"failed"}),
    row("C",22.1,{updatedAt:2}),row("D",22.2)]);
  expect(result.points.map(p=>[p.id,p.attempt,p.score,p.best])).toEqual([
    ["A",1,22.3,22.3],["B",2,null,22.3],["C",3,22.1,22.1],["D",4,22.2,22.1],
  ]);
});
it("excludes rejected, unverified and incompatible attractive scores", () => {
  const result=chartProgress([row("A",0,{validation:"rejected"}),row("B",0,{validation:null}),
    row("C",0,{evaluation:"single-puzzle"}),row("D",22.2)]);
  expect(result.points.map(p=>p.score)).toEqual([null,null,null,22.2]);
  expect(result.best).toBe(22.2);
  expect(result.incompatible).toBe(1);
});
it("does not invent a score before measurement and supports higher-is-better research", () => {
  expect(chartProgress([row("A",0,{status:"planned",metric:null})]).best).toBeNull();
  expect(chartProgress([row("A",24,{direction:"higher"}),row("B",23.5,{direction:"higher"})]).best).toBe(24);
});
it("handles 1000 attempts without renumbering excluded records", () => {
  const result=chartProgress(Array.from({length:1000},(_,i)=>row(`A-${i}`,23-i/10000,
    i%10===0 ? {validation:"rejected"} : {})));
  expect(result.points).toHaveLength(1000);
  expect(result.points[999].attempt).toBe(1000);
  expect(result.best).toBe(22.9001);
});
