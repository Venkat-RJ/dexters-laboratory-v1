# Experiment files

The agent writes project-root `experiments.json` before launch. Preserve existing entries. If a project uses a different journal schema, preserve that journal and report the conflict. Link each entry to one existing topic ID in `mind-map.json`. Use a unique ID made of letters, digits, underscores or hyphens. Each ID owns one attempt and a directory of the same name.

```json
{"version":1,"experiments":[{
  "id":"E-001",
  "nodeId":"border",
  "title":"Test L-shaped borders",
  "hypothesis":"A border extension can beat an incumbent.",
  "baseline":"Compare with saved incumbents and grids.",
  "success":"Checker accepts a smaller bounding side.",
  "plan":"experiments/E-001/plan/main.tex",
  "evaluation":{"id":"packing-17-pinned-checker","direction":"lower"},
  "totalCases":11
}]}
```

Create `experiments/<id>/experiment.md` before launch. Use it for the question, plan, observations, outcome, limitations and next decision. Keep progress and timings in the runner receipt that Lattice shows above the note. Link case data and logs using paths relative to the note. One attempt or sweep can contain many cases. Preserve all case records in the run files.

Choose one evaluation ID per comparable setup, including the objective, inputs and evaluator version. Use `lower` or `higher` for the direction. Reuse an ID only when scores can be ranked together. Emit optional score and baseline summary events as provisional worker observations. Independent campaign validation establishes trusted scores. For candidate experiments, take the baseline value from the validated reference run and link its attempt in the note. Identify an acceptance target separately. The tracker ranks independently validated comparable results within their evaluation. A failure has its own outcome even if it produced partial measurements. Read the journal and linked receipts to find prior scores and outcomes when choosing the next experiment.

Omit `totalCases` when the number of checks is unknown. After analysis the agent records the research decision in experiment.md. Optional journal outcome prose may be updated only while dispatch is paused and workers/verifiers are finished, preserving coordinator-owned fields. Leave the plan and command in the attempt folder and link evidence in the manuscript. Give a retry a new ID and set its `retryOf` to the previous attempt ID. Lattice groups those attempts in the tracker. The coordinator sets queued and execution status for campaign attempts. Save the JSON by replacing it atomically, checking for any existing human edits first.

For new investigations use the [campaign interface](campaigns.md). Lattice prepares `.research/tools/campaign.py`. Enqueue the planned ID with a frozen source commit in Git projects, or declared snapshot files otherwise. Keep inputs and evaluator identities in the evaluation, outputs in DEXTER_ARTIFACT_DIR, and mutable worker state isolated. Let the coordinator own launch failures, receipts and journal state. Preserve plan snapshots and link exact source revisions from the note.

Legacy run_experiment.py receipts remain readable. Their scores are unverified until independent validation is recorded. Do not use the legacy launcher for a new campaign.

In the numerical script, append one flushed JSON line to the path in `DEXTER_CASE_EVENTS` when each case begins and after checking its result. Use a distinct case label for each check. Each completed result event contributes one to the count, including rejected cases.

```jsonl
{"type":"started","case":"17 squares, border extension"}
{"type":"result","case":"17 squares, border extension","result":"Checker could not certify non-overlap.","evidence":"experiments/E-001/candidate-17.csv"}
```

When the run produces a comparable primary metric, emit a summary with the measured value and the comparable baseline in the same units. Exact values and provenance belong in the case evidence.

```jsonl
{"type":"summary","metric":{"name":"Side length","value":4.7,"baseline":4.6755,"unit":"units"}}
```

The campaign worker and coordinator create `cases.jsonl`, `run-status.json`, `stdout.txt` and `stderr.txt`. Let them own these files. They publish elapsed time, the current case, the count and last 25 checked results, and a terminal status. Preserve any partial output. Declare per-attempt seconds and cpuSlots to the coordinator. CPU and memory observations are not hard fences.

Campaign runs use the [campaign interface](campaigns.md). Legacy `run_experiment.py` receipts are provisional and require separate validation before trusted score ranking. Do not infer validation from exit status.
