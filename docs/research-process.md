# Dexter research in a paper workspace

`main.tex` is the evolving research document, and its compiled PDF is the view the researcher reads, comments on and revises in Lattice. The seven investigation skills update this same document. They are instructions for the existing agent, not separate agents or an application controller.

## Starting document

New Project defaults to Research workspace. It creates main.tex with included root-level stage .tex files for formulation, prior knowledge, hypotheses, setup/baseline, experiment plan, results, conclusions, status and next steps, plus sources/prior-knowledge.md, mind-map.json, experiments.json, setup/setup.md, setup/environment.json and empty inputs/ and experiments/ folders, plus AGENTS.md and research-log.md. No campaign starts and no dependencies are installed by project creation. The tracker is empty and setup is unverified. Existing projects are never overwritten.

For a new investigation in an older paper project, the formulation skill copies missing supporting files and uses its [main.tex template](../src-tauri/src/embedded_skills/research-formulation/assets/main.tex) into the project. It uses a plain article layout and common LaTeX packages, with no conference style or bibliography required for the first compilation.

For an existing paper, preserve its main file, included sections, macros, citations, comments and human edits. A different established root filename is fine. Do not replace it with the template. Existing Markdown notes remain useful evidence; integrate their supported findings instead of deleting them or maintaining two authoritative narratives.

| Skill | Main document responsibility | Supporting files |
| --- | --- | --- |
| `research-formulation` | Question and scope; research status | Supplied context |
| `research-prior-knowledge` | Prior knowledge, citations and evidence gaps | Source snapshots and notes |
| `research-mind-map` | Link the map and explain what it reveals | Branching `mind-map.json` |
| `research-setup-baseline` | Verified environment, evaluator and measured reference result | `setup/environment.json`, dependency lock, smoke evidence and baseline attempt |
| Design of Experiments (`research-experiment-planning`) | Hypotheses, experiment plan and stopping conditions | Detailed implementation inputs when needed |
| `research-experiment-execution` | Attempt records and measured results | `experiments/<attempt>/` with plan snapshot, code, inputs, raw outputs and errors |
| `research-results-analysis` | Interpretation, limitations and next decision | Detailed analysis calculations when needed |
| Existing `research-writing` | Publication-oriented revision of the same document, when requested and enabled | Existing evidence record |

Research status and Open questions and next steps provide continuity between turns. Do not create separate `research.md`, `formulation.md`, `analysis.md` or `final-report.md` files by default. Large logs and source extracts belong outside the paper and must remain linked to its claims. The mind map stays an editable companion.

Each substantive document edit is checked with Lattice's existing project build tools. A scientific result and a successful PDF build are separate checks. Missing tools or unresolved compilation errors must be reported. Skills preserve the workspace layout. Open `mind-map.json` and `experiments.json` from Project or Quick Open. Lattice renders both as tabs. The agent creates the map through project file edits and connects an experiment to a stable topic ID when it saves the plan. The background runner records case progress and receipts as work happens. The [experiment file contract](../src-tauri/src/embedded_skills/research-experiment-execution/references/experiment-files.md) describes the records.

Before using citations on a fresh Lattice installation, complete Settings > TeX doctor > Install required tools. This installs the app-managed `uv` and `uvx` required by its pinned bibliography tools. A working LaTeX compiler alone does not establish that citation setup is complete.

There are no formulation or plan approval checkpoints. A full investigation proceeds between stages and can revisit earlier questions when evidence changes. A request for one stage stays within that stage. Normal tool permissions and the user's scope and resource limits still apply.

## Start an investigation

In the existing Agent chat:

```text
Investigate this problem: [problem and supplied context].

Use the research skills and main.tex as the evolving research document. If this is a new project, start from the research-formulation skill's main.tex template. Preserve an existing paper and its included files.

Develop the question, prior knowledge and hypotheses. Prepare the execution environment and validate a baseline through the real evaluator before planning candidate experiments. Run a bounded experiment, preserve every attempt and its evidence, then update the results, conclusions, limitations and next steps in the same document. Build and check the PDF through Lattice's project tools.

Constraints: [available data, time, compute and other limits].

Continue without stage approval requests. Keep plans, assumptions, observations and interpretations distinguishable. Keep my workspace arrangement unchanged.
```

The seven skills and the template are bundled under `src-tauri/src/embedded_skills/`, using Lattice's existing skill discovery. Lattice opens the map and experiment list in document tabs. The experiment runner uses the existing agent command runner. Research Writing retains its existing opt-in behavior. The process is instruction-driven; one successful trial does not prove reliable behavior across arbitrary investigations.

## Research decisions and local limits

The flow is formulation, prior knowledge, refined question and mind-map ideas, setup and measured baseline, detailed experiment design, execution and validation, then analysis and the next justified batch. Charts update from validated results throughout. main.tex preserves the reasoning and final conclusions.

A new local campaign uses two workers and has no elapsed cutoff unless the user supplies a time limit. The agent uses bounded runs and reassesses after each batch, continuing only with a justified next experiment. It records why it stops, verifies the selected result and finishes reporting. Explicit deadlines persist across batches and pauses. Stop, shutdown cleanup and per-run timeouts remain active. Paid or remote resources need separate authorization.

Environment readiness means successful smoke checks. Baseline validity is a separate condition. The coordinator launches every new computational attempt and owns its journal status and independent validation. The research agent chooses tests, interprets evidence and updates notes and the manuscript. At batch boundaries it records what changed, the remaining alternative, and why the next experiment is useful or why work should stop.

The root-level research-log.md records consequential actions and observed outcomes with links to the relevant stage files and evidence. It is updated during work. Stage prose lives in formulation.tex, prior-knowledge.tex, hypotheses.tex, setup-baseline.tex, experiment-plan.tex, results.tex, conclusions.tex, status.tex and next-steps.tex. main.tex includes these files. Raw receipts and large case ledgers remain under experiments/ and setup/.

## Mind-map review

After at least three planned source-search and synthesis passes, the existing research agent delegates one read-only map review to a native subagent using the same runtime and account. The parent saves the actual reviewer ID and response, fixes findings and requests a recheck. No separate provider or isolated text-generation call is used. The UI checks that the passing receipt covers all topics and matches the current saved evidence before showing "Mind map ready (subagent reviewed)." This is a second agent review, not independent scientific replication. Experiment execution and validation remain separate.
