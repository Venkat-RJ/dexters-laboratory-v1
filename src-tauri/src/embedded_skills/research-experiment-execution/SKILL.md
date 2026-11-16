---
name: research-experiment-execution
description: "Implement and run a planned research experiment using existing agent tools, retaining reproducible inputs, outputs and failed attempts. Use when execution is requested or included in an ongoing investigation."
metadata:
  short-description: "Run experiments and retain reproducible evidence"
---

# Experiment execution

Use overall Charts to follow progress across experiments. It reads validated scores from run receipts, grouped by evaluation and research branch. Keep one comparable evaluation ID and a measured baseline for each setup. Do not create per-run charts or chart definitions; retain detailed measurements as evidence in the attempt folder.

Use the [campaign interface](references/campaigns.md) for every new computational setup, baseline and candidate attempt. Use the [experiment file contract](references/experiment-files.md) for notes, planned entries and progress. Workers emit provisional case events. The coordinator independently verifies saved artifacts and owns receipts and trusted best decisions. The old run_experiment.py is only for inspecting or reproducing legacy work outside a new campaign.


Read the main LaTeX document (`main.tex` by default), its included sections, especially the question, constraints and experiment plan, and the existing attempt folders. If the plan lacks a meaningful test or stopping condition, complete it with `research-experiment-planning` before running. There is no separate research approval gate; the requested task and normal tool permissions define what may run.

Use the verified interpreter, dependencies, data, evaluator and compute from `setup/environment.json`; copy that record into the attempt before launch. For a candidate run, verify the baseline receipt is usable and comparable. If required setup is missing or changed, use `research-setup-baseline` before launching. For a baseline attempt, perform the environment smoke check first and finish the setup record after validating the baseline. Use the same explicit interpreter or launcher for the checks and child command.

For the first launch, use the existing planned entry's ID, note and directory `experiments/<id>/`. Use the same ID in the runner command, receipt, and manuscript. Allocate a new ID only for a new attempt. For a retry, link it to the previous attempt with `retryOf`. Before execution, save the main `.tex` file and the included files that define the plan under that attempt's `plan/` directory, preserving relative paths. Retain the code or its exact revision and changes, input identities, environment details, commands, seeds where relevant, raw outputs, errors and a concise result note. Hash important input and output files when exact-byte identity matters; a filename alone does not identify changing data.

Use the agent's normal background command runner to call the project campaign client; let the coordinator launch measurement processes. Do not launch Terminal.app or open the application's Terminal panel automatically. Start with a small correctness or feasibility check before the planned larger run. Use supported timeout and cancellation controls for the recorded limits. Do not claim a hard limit was enforced if the runner cannot enforce it.

Track the command or job until completion, interruption or a reported blocker. Record exit status, elapsed time and actual measurements. On interruption, inspect whether the job remains active and which artifacts exist before resuming. Avoid starting a duplicate job or repeating a completed measurement just because the conversation changed.

Keep failed, timed-out and non-improving attempts. When a launch fails before the runner can write a receipt, retain the error and record it as a launch failure using the file contract. A repaired rerun gets its own attempt. Diagnose execution failures without turning endless retries into an unbounded study. Never substitute an expected metric for missing output.

Validate produced outputs with the planned checks. Record successful execution separately from correctness and scientific interpretation. Add an entry to the main document's Experiments and results section linking the question, attempt folder, status, measurements, limitations and next decision. Keep raw logs and large outputs in their attempt folders, not in the paper.

Update Research status in the main document. Preserve existing LaTeX and human edits; use Lattice's project build tools to verify the updated paper. An experiment's success does not imply the document compiled successfully. For a full investigation, continue to `research-results-analysis` without a stage approval checkpoint. An execution-only request ends with the measured results and validation status.

Append consequential actions and observed outcomes to root-level research-log.md as this stage proceeds, linking changed stage files, source notes, commands or run evidence. Keep failed actions and revisions visible. Use the existing included stage .tex files when present; main.tex assembles them. Do not duplicate their scientific prose in the activity log.

## Bounded parallel investigations

For computational work, follow the [campaign interface](../research-experiment-execution/references/campaigns.md). When the user supplies no time limit, omit the campaign budget and let research results determine when to stop. Use bounded runs and reassess after each batch; see the campaign interface for stopping criteria. One research agent makes decisions; the coordinator owns dispatch, validation, journal state and accepted best. Preserve failures and non-improvements. Honor explicit deadlines and user stops.

## Research scratchpad

Use the [shared scratchpad guidance](../research-formulation/references/scratchpad.md) to retain useful findings, questions and ideas in root-level `scratchpad.tex`. Consult relevant entries before the next research decision and record meaningful insights as this stage proceeds. Preserve user notes and distinguish speculative ideas from verified results.
