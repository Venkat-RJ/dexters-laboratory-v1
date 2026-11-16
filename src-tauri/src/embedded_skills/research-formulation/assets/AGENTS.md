# Research workspace

Use the existing research skills. main.tex assembles the evolving research record from root-level stage .tex files. Edit each included stage file in place and compile main.tex. Preserve the user's question and edits. Save each stage as it progresses so the researcher can inspect it.

Start by replacing the prompts in formulation.tex. Then review sources in sources/prior-knowledge.md, refine the question and update mind-map.json with source-grounded knowledge and possible directions. Plan source searches before running them and complete at least three distinct search/synthesis passes. Use the prior-knowledge and mind-map skills for the existing-runtime subagent review and revisions; keep experiment planning separate. These template files contain no findings.

Record setup requirements and evidence in setup/setup.md and setup/environment.json. Unknown fields remain null. Environment readiness requires a real worker smoke check; baseline validity is separate. Create dependency manifests, locks and evaluators only when the problem requires them. Keep generated packages and caches out of Git.

Use the campaign coordinator for computational setup, baselines and candidates. When the user supplies no time limit, omit the campaign budget. Use bounded runs, reassess results after each batch, and record why the research should continue or finish. Do not request a total research cost estimate. Do not extend explicit user deadlines or use paid/remote compute without authorization. Normal tool permissions still apply. There are no research-stage approval gates.

experiments.json starts empty. Create a note under experiments/<attempt>/ when an experiment is actually planned. Preserve every attempt and exact evidence. Link runs to stable map nodes. Use overall Charts only. After a batch, interpret results and choose the next useful bounded test or stop with a reason. Verify selected saved bytes and compile the final PDF.

Keep research-log.md visible at the project root. Append concise records of consequential actions, observed outcomes, changed files and evidence links as work happens. Preserve failures and changes of direction. This is an activity record, not a substitute for the scientific argument or raw logs. main.tex includes the root-level stage files so there is one authoritative paper, without copying the same prose into several files.

Before marking a stage or preparation pass complete, read back its visible stage files and companion notes. Replace obsolete template status text, check that evidence links resolve, and keep unperformed stages explicitly unperformed. In particular, source review updates both prior-knowledge.tex and sources/prior-knowledge.md; the latter is a coverage and evidence index, not a second manuscript.

Read setup/project.json for initial Git readiness. Use the campaign `inspect` operation for run status, not OS process inspection. The agent does not need Apple Events or System Events to execute research. If panel navigation is unavailable, report that separately from scientific execution.

Treat a search with no matches as a normal empty result. When scripting `rg`, distinguish exit 1 (no matches) from exit 2 (an actual error), and return a successful structured empty result for the former. Run `python3 setup/probe.py capabilities` once before using optional tools. It reports missing tools without failing; use an available alternative. Use `python3 setup/probe.py search PATTERN PATH` for exploratory searches: no matches returns a successful `no_matches` result, while actual errors remain failures. Do not chain optional probes with required setup steps.

Maintain root-level research-state.json as work progresses, following research-prior-knowledge/references/research-status.md. Report the actual stage, pass, pause, blocker or completion with the current timestamp. Lattice displays this state in its existing toast. Mark a mind map ready only after recording a passing subagent review of the current saved evidence.

Use root-level scratchpad.tex to remember useful findings, ideas, questions and user reminders throughout the work. Follow research-formulation/references/scratchpad.md. Keep stable entry IDs, dates, uncertainty, evidence and revisit cues. Read relevant entries before choosing the next direction. Keep rough notes out of the final manuscript by default; scratchpad.tex is its own LaTeX document.
