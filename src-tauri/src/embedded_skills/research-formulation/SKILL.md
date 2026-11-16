---
name: research-formulation
description: "Turn a research problem into a clear question, scope and evaluation criteria. Use at the start of an investigation or when its question changes, before planning experiments, using main.tex as the evolving research document."
metadata:
  short-description: "Define the question, scope and success criteria"
---

# Problem formulation

Work in the current Lattice project. Read the user's problem, supplied material and `main.tex`, following its `\input` and `\include` files. Preserve the user's research choices, comments, macros and edits. If the project already uses another main LaTeX file, keep that root.

For a new investigation without a manuscript, use the Research workspace template from New Project, or copy [assets/main.tex](assets/main.tex) into the project as `main.tex`. This is a starting document, not content to overwrite an existing paper with. For an older Markdown study, integrate its supported content and link the original notes as evidence rather than deleting them.

At the start, inspect the stage files. Reuse equivalent authored source or setup notes when they already exist. For older paper projects, copy otherwise missing files from assets/: mind-map.json, experiments.json, setup/environment.json, setup/setup.md, sources/prior-knowledge.md, sources/search-plan.md, research-state.json, scratchpad.tex and research-log.md, creating their parent folders. For the supplied main.tex, copy every root-level .tex file from assets/ too. If an existing manuscript is already authored, preserve its structure instead of inserting template sections. Never overwrite existing research files or AGENTS.md. The supplied placeholders are unverified structure, not completed work. Replace prompts progressively and keep the tracker empty until an attempt is actually planned.

Write or revise the Question and scope section of the main document, editing its included formulation.tex when present, with the problem, research question, intended outcome, scope, exclusions, evaluation criteria, resource constraints, known facts, assumptions and unresolved questions. Use only the sections the problem needs. Separate the user's requirements from your proposed interpretation.

Make the question precise enough that evidence could change the answer. Choose an evaluation appropriate to the contribution: a proof, explanation, replication, measurement or negative result can be useful without outperforming a benchmark. Do not invent an incumbent score, dataset property or novelty claim.

Explain why the question matters, the limitation it addresses, and the contribution sought (construction, algorithm, explanation, replication, proof or other answer). Preserve the user's ambition. Label a feasibility test or toy example with its role and limits; never silently substitute it for the intended investigation. Define objects, controllable variables, constraints and the comparison in ordinary language and equations where helpful. Distinguish a target, a published score and a locally validated baseline.

Make the formulation as detailed as clarity requires. Explain what evidence could support or weaken the intended claim, including an informative negative or inconclusive answer. Identify consequential assumptions and how source review or setup will check them. Inspect reusable figures or previews; add a diagram or local illustrative preview when it makes geometry, assumptions or test cases understandable. Label illustrative outputs and link them from the paper. A preview is not validation.

Use the [research decision guide](references/research-decisions.md) to assess the question and later decisions. After prior knowledge, revisit the formulation before choosing experiments. Preserve changes and their reasons in the existing document and Git history.

Use explicit working assumptions when uncertainty does not prevent useful work. Ask a focused question only when the missing answer changes the task materially and cannot be resolved from the supplied context. Formalization should not become a long intake questionnaire.

Keep the Research status and Open questions and next steps sections current. The main document is the shared research record; do not create a parallel formulation or status document by default. Mark statements as planned, assumed, observed or unresolved where the distinction matters.

Build through Lattice's existing project build tools after the substantive edit. Check compilation and unresolved references, repair errors introduced by your edit, and report unavailable checks. Keep evidence files separate and refer to them from the document.

Save an authored formulation in main.tex before moving to source review. Replace untouched template prose with the actual question, scope, evidence criteria and open questions; do not leave the useful formulation only in chat. Tell the user which file or section is ready to inspect.

There is no formulation approval gate. For a full investigation, continue to `research-prior-knowledge` once the question is usable, carrying open questions forward. For a formulation-only request, return the draft without starting unrelated work. Normal tool permissions and the user's resource limits still apply.

Use existing editors and agent tools. Do not rearrange the workspace or open panels or Terminal.app automatically.

Append consequential actions and observed outcomes to root-level research-log.md as this stage proceeds, linking changed stage files, source notes, commands or run evidence. Keep failed actions and revisions visible. Use the existing included stage .tex files when present; main.tex assembles them. Do not duplicate their scientific prose in the activity log.

## Bounded parallel investigations

For computational work, follow the [campaign interface](../research-experiment-execution/references/campaigns.md). When the user supplies no time limit, omit the campaign budget and let research results determine when to stop. Use bounded runs and reassess after each batch; see the campaign interface for stopping criteria. One research agent makes decisions; the coordinator owns dispatch, validation, journal state and accepted best. Preserve failures and non-improvements. Honor explicit deadlines and user stops.

## Research scratchpad

Use the [shared scratchpad guidance](../research-formulation/references/scratchpad.md) to retain useful findings, questions and ideas in root-level `scratchpad.tex`. Consult relevant entries before the next research decision and record meaningful insights as this stage proceeds. Preserve user notes and distinguish speculative ideas from verified results.
