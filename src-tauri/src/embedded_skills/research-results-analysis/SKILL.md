---
name: research-results-analysis
description: "Interpret research experiment outputs against the original question and evaluation criteria, including failures and negative results. Use to decide the next investigation step or prepare an evidence-grounded final report."
metadata:
  short-description: "Interpret results and decide the next research step"
---

# Results analysis

Read the main LaTeX document (`main.tex` by default), its included sections, the plan snapshot preserved with each relevant attempt and the actual outputs. Do not treat an earlier agent's summary as a substitute for the underlying evidence.

Update the main document's Experiments and results, Conclusions and limitations, and Open questions and next steps sections. Keep the reasoning readable beside its evidence; detailed calculations can live in linked files. Compare results with the predeclared criteria and reference methods. Check that inputs, units, evaluation settings and resource use make comparisons meaningful. Explain uncertainty, confounders and competing interpretations. Distinguish observed measurements, supported conclusions and hypotheses requiring another test.

Record interpretation in the experiment note after inspecting its receipt and evidence. Update optional outcome prose in experiments.json only while dispatch is paused and all workers/verifiers are finished, re-reading and atomically preserving coordinator-owned fields. Keep the outcome short. Update `experiments/<id>/experiment.md` with the outcome and next decision first, followed by observations, comparisons, limitations and relative links to exact evidence. Preserve the original plan and human edits. Summarize findings relevant to the paper in the manuscript. Revise the linked map branch when the evidence changes it.

Account for all relevant attempts, including failures, incomplete runs and results that did not improve the objective. Separate execution success, correctness validation, local reproduction, independent replication and generalization. Do not describe one successful local run as proving all of them.

At each meaningful batch boundary, apply the [research decision guide](../research-formulation/references/research-decisions.md). Read the campaign summary and validation receipts. Compare against both the fixed baseline and current accepted best. Explain what changed in our understanding, the strongest remaining alternative, and what result from the next test would change the decision. Judge progress across experiments, not merely the latest score.

For noisy or adaptive searches, distinguish selected best observations from repeatable improvements. Preserve disagreements across seeds, metrics or instances. Use independent confirmation or held-out cases when the claim requires them. A better construction supports that construction; a generally better method requires broader fair comparison. Failure to improve does not prove optimality.

For a full investigation with useful work remaining, register the next justified bounded batch and resume the existing campaign. A plateau prompts reassessment, not automatic termination. Consider refinement, a different branch, a restart, a larger perturbation, or reproduction while retaining the best valid fallback. Use `reassess` to record the decision. Do not end at a recommendation when continued execution is authorized and useful. Finish when the question is answered, a relevant target is reached, the window ends, the user stops, or explain why further work is unjustified or blocked. Never start another campaign merely to evade the limit.

Choose the next decision from the evidence: refine the question, read a specific missing source, test an alternative, reproduce a result, or stop. A further experiment should have a stated outcome that would change the conclusion. Continue within the user's remaining scope and resources; do not automatically repeat the entire process after every run.

Keep the prior-knowledge notes and map consistent with important new evidence while preserving the history of what was believed and tested. Update Research status in the main document with the current conclusion, its strongest evidence, remaining uncertainty and next action or stopping reason. If the user asked for analysis only, report the recommendation without launching new experiments.

At the end of an investigation, finish the existing main document as the research report, with the question, methods, linked attempts and sources, positive and negative findings, limitations, stopping reason and reproduction instructions. Do not create `final-report.md` or another competing summary by default. Use the existing project build tools and verify the compiled PDF and unresolved references. Report compilation gaps separately from research results. A well-supported negative result is a complete outcome. If publication-oriented revision is requested and the existing `research-writing` skill is available, use it to refine this same document while preserving its evidence and qualifications. Otherwise finish the research draft plainly; do not change skill preferences to activate it.

There is no stage approval checkpoint. Use existing project files and tools, and leave the user's layout and panels unchanged.

Append consequential actions and observed outcomes to root-level research-log.md as this stage proceeds, linking changed stage files, source notes, commands or run evidence. Keep failed actions and revisions visible. Use the existing included stage .tex files when present; main.tex assembles them. Do not duplicate their scientific prose in the activity log.

## Bounded parallel investigations

For computational work, follow the [campaign interface](../research-experiment-execution/references/campaigns.md). When the user supplies no time limit, omit the campaign budget and let research results determine when to stop. Use bounded runs and reassess after each batch; see the campaign interface for stopping criteria. One research agent makes decisions; the coordinator owns dispatch, validation, journal state and accepted best. Preserve failures and non-improvements. Honor explicit deadlines and user stops.

## Research scratchpad

Use the [shared scratchpad guidance](../research-formulation/references/scratchpad.md) to retain useful findings, questions and ideas in root-level `scratchpad.tex`. Consult relevant entries before the next research decision and record meaningful insights as this stage proceeds. Preserve user notes and distinguish speculative ideas from verified results.
