---
name: research-experiment-planning
description: "Design a discriminating research experiment from a question and existing evidence. Use to choose hypotheses, baselines, controls, measurements and stopping conditions before execution."
metadata:
  short-description: "Plan useful tests, comparisons and resource limits"
---

# Design of Experiments

Use overall Charts to follow progress across experiments. It reads validated scores from run receipts, grouped by evaluation and research branch. Keep one comparable evaluation ID and a measured baseline for each setup. Do not create per-run charts or chart definitions; retain detailed measurements as evidence in the attempt folder.

Read the main LaTeX document (`main.tex` by default), its included sections, the current map and previous experiment records. Plan the smallest test whose possible outcomes would change the research decision. A request for an experiment plan does not itself request execution.

For candidate experiments, read `setup/environment.json` and the baseline receipt from `research-setup-baseline`. Identify the tested interpreter, dependencies, execution host, evaluator, inputs and baseline measurement in the plan. If those checks are missing or no longer match, complete setup before candidate execution. A planning-only request may record these as unresolved prerequisites. Keep a required target distinct from the measured baseline.

Design the test using the skills and evidence. Before launch, add a planned entry to project-root `experiments.json` using the [experiment file contract](../research-experiment-execution/references/experiment-files.md). Set its `nodeId` to the map topic the experiment tests. Write `experiments/<id>/experiment.md` as the editable lab note, with the question, hypothesis, plan, baseline, success criteria and evidence links. Lattice opens this note from the tracker and displays live status above it. Write the runnable script or exact invocation and preserve the planned inputs with the attempt. Update the Hypotheses and Experiment plan sections of the manuscript to record the reasoning and link the plan. Record:

- The question or hypothesis, its evidence links and plausible alternatives.
- Inputs, data provenance, method and an appropriate reference or baseline.
- Controls, correctness checks, metrics, uncertainty estimates or repeated runs where warranted.
- What each possible outcome would mean, including null or negative results.
- The commands or implementation still needed, dependencies and resource limits.
- Stopping conditions and which outputs must be retained for analysis and reproduction.

Use the [research decision guide](../research-formulation/references/research-decisions.md) to compare proposed tests by the uncertainty they resolve, expected cost and consequence for the next decision. Choose informative controls, ablations or reproductions when another score sweep would teach little. Explain why the selected baseline is credible and give competing methods comparable tuning and execution opportunities.

Distinguish a research question, a meaningful experiment, its measurement attempts/retries and the candidate cases inside an attempt. Keep large sweeps in structured artifacts. For adaptive searches, separate development choices from final confirmation; choose repetitions, seed handling, aggregation and uncertainty appropriate to the claim. Thousands of related candidates are not thousands of independent replications. Report the selection process and avoid interpreting the luckiest noisy score as reliable progress.

Define success and failure before observing the result. Keep exploratory tuning separate from held-out evaluation. Do not silently redefine the acceptance criterion or use results from test data to select a method while reporting them as an independent evaluation.

Use the user's stated constraints; do not invent a campaign time limit. Estimate cost from the smoke check and baseline, then choose a small bounded batch. Record estimates separately from enforced limits. Paid resources and remote execution require their own authorization and backend support.

Do not overwrite the plan associated with a completed attempt. Execution should snapshot the main document and included files with that attempt before running; subsequent edits update the current paper and explain what changed. Planned outcomes must remain visibly distinct from measured results.

Record the next test in the main document's Research status and link it from the map when useful. Preserve macros and human edits, then use the existing project build tools to check the updated plan. For a full investigation, continue to `research-experiment-execution` within the requested scope without a plan approval checkpoint. If a central ambiguity makes the test meaningless, resolve that ambiguity instead of running it.

Append consequential actions and observed outcomes to root-level research-log.md as this stage proceeds, linking changed stage files, source notes, commands or run evidence. Keep failed actions and revisions visible. Use the existing included stage .tex files when present; main.tex assembles them. Do not duplicate their scientific prose in the activity log.

## Bounded parallel investigations

For computational work, follow the [campaign interface](../research-experiment-execution/references/campaigns.md). When the user supplies no time limit, omit the campaign budget and let research results determine when to stop. Use bounded runs and reassess after each batch; see the campaign interface for stopping criteria. One research agent makes decisions; the coordinator owns dispatch, validation, journal state and accepted best. Preserve failures and non-improvements. Honor explicit deadlines and user stops.

## Research scratchpad

Use the [shared scratchpad guidance](../research-formulation/references/scratchpad.md) to retain useful findings, questions and ideas in root-level `scratchpad.tex`. Consult relevant entries before the next research decision and record meaningful insights as this stage proceeds. Preserve user notes and distinguish speculative ideas from verified results.
