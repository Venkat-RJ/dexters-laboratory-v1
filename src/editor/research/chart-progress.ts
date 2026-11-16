export type ChartRow = {
  id: string; title: string; nodeId: string; status: string;
  validation?: string | null; evaluation: string | null; direction: string | null;
  updatedAt: number | null; scoreOutcome: string | null;
  metric: {name: string; value: number; baseline: number; unit?: string} | null;
};

function trusted(row: ChartRow) {
  return row.status === "completed" && row.validation === "passed" && !!row.evaluation
    && (row.direction === "lower" || row.direction === "higher")
    && row.metric !== null && Number.isFinite(row.metric.value) && Number.isFinite(row.metric.baseline);
}
function identity(row: ChartRow) {
  return JSON.stringify([row.evaluation, row.direction, row.metric?.name, row.metric?.unit ?? "", row.metric?.baseline]);
}

export function chartProgress(rows: ChartRow[]) {
  // The tracker returns journal order. Receipt updates must not renumber attempts.
  // Use the latest validated evaluation; never mix scores with different contracts.
  const reference = [...rows].reverse().find(trusted);
  const key = reference && identity(reference);
  let best: number | null = reference?.metric?.baseline ?? null;
  let seen = false;
  const points = rows.map((row, index) => {
    const comparable = trusted(row) && identity(row) === key;
    const score = comparable ? row.metric!.value : null;
    if (score !== null) {
      best = reference?.direction === "higher" ? Math.max(best!, score) : Math.min(best!, score);
      seen = true;
    }
    return { id: row.id, title: row.title, attempt: index + 1, score,
      best: seen ? best : null,
      state: comparable ? row.scoreOutcome ?? "validated" : row.validation === "rejected" ? "rejected"
        : trusted(row) ? "different_evaluation" : row.status === "completed" ? "unverified" : row.status };
  });
  return { points, reference, best: seen ? best : null,
    incompatible: rows.filter(row => trusted(row) && identity(row) !== key).length };
}
