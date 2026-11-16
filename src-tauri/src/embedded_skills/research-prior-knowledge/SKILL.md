---
name: research-prior-knowledge
description: "Find, read and synthesize sources for a research question. Use to establish prior knowledge, competing explanations, existing methods and evidence gaps for understanding a problem and exploring research directions."
metadata:
  short-description: "Build source-grounded knowledge and identify gaps"
---

# Prior knowledge

Read the main LaTeX document (`main.tex` by default), its included sections and existing source notes. Search from the actual question and open uncertainties. Reuse relevant sources already in the project before collecting more.

Plan before searching and complete at least three distinct search-and-synthesis passes for a prior-knowledge investigation:

1. Map the breadth: terminology, subproblems, foundational results and main approach families.
2. Deepen methods and alternatives: follow references and citing work, compare assumptions, mechanisms, variants and limitations.
3. Challenge coverage: investigate thin branches, contrary findings, unresolved disagreements and related fields that could expose missing directions.

Use the question to choose queries and source types, revising the next pass from what the previous one revealed. Save the plan before each pass and the observed searches/findings afterward in sources/search-plan.md. Repeated identical searches do not count as separate passes. Additional passes are appropriate when important gaps remain. Honor a user stop or unavailable sources by recording incomplete work rather than claiming three passes happened. Update the visible research state using the [status and review contract](references/research-status.md).

For downloaded API responses, save the raw response and inspect its shape before parsing. For notebooks or Kaggle notebook responses, use `python3 scripts/extract_notebook.py INPUT_JSON OUTPUT_PY` from this skill directory. It handles direct notebooks, serialized notebooks and blob/sourceNullable wrappers, validates cell structure, preserves the raw source and refuses to overwrite an evaluator. Inspect the extracted code before running it.

Use the available literature tools and paper library. Inspect primary source text where possible. A search snippet or bibliography entry does not establish support for a claim. In Lattice, cached `paper.md` is source text; `blog.md` is a secondary explanation. Add bibliography entries through the existing tools rather than editing `.bib` files or inventing citation keys.

If a citation call reports missing paper tools or managed `uv`/`uvx`, stop repeating citation calls: setup is missing, not the source. The existing repair is Settings > TeX doctor > Install required tools. Once setup is complete, retry the citation and use the returned key in the main document. Until then, retain direct source links and report the limitation. Do not install a separate global citation tool or hand-write replacement bibliography entries.

Update the Prior knowledge section of the main document. Keep detailed source extracts in linked evidence files instead of creating another authoritative narrative. For each consequential finding, include its source link or project path, a useful page or section locator, what was actually established, and its assumptions or limitations. Distinguish source claims, observed evidence and your interpretation. Mark sources you could not access as unverified leads.

Synthesize agreements, disagreements, relevant methods, baselines, known failures and unresolved questions. Search for evidence that could contradict the preferred approach. Do not claim novelty or exhaustive coverage merely because a search found no match. Record coverage limits and unavailable search capabilities.

Use sources/prior-knowledge.md when the workspace supplies it: replace its unreviewed prompts with search coverage, a compact source/evidence index and links to saved captures. Keep the scientific synthesis in the included prior-knowledge.tex, without duplicating it. Do not leave the supplied source note marked unreviewed after completing source review. Record why the closest sources, baselines and competing approaches matter. Follow relevant references and check contrary findings where they could change the decision. Distinguish a reported best construction from a proof of optimality. Identify source-dependent assumptions and unresolved disagreements.

Match the search to the requested scope. For deep understanding or broad mapping, explore distinct concepts, subproblems, method families, assumptions, limitations, competing explanations and related fields. Follow references and citing work from useful sources, and search unfamiliar terminology revealed by them. Finding one promising experiment is not a stopping condition for this scope.

Work iteratively with `research-mind-map` when mapping is requested: sources reveal branches; thin, uncertain or contradictory branches guide further source searches. Expand those branches with substantive distinctions and source-backed explanations. Preserve alternative directions before selecting among them. A literature-only request can keep this organization in its synthesis without creating a map.

Before handing off, revise the formulation with what the sources changed. Preserve the user's constraints and distinguish established knowledge from proposed directions.

After the three passes, stop according to the requested scope: a focused question may need a focused search; a thorough knowledge map needs coverage across its important branches. Continue while relevant searches reveal meaningful new concepts, methods or disagreements. When further searches mostly repeat existing material, record what was searched, remaining gaps and access limits. Do not use a fixed source or node quota, or claim literal exhaustiveness. Keep experimental hypotheses, protocols and run records in Design of Experiments when that work is requested.

Save the source synthesis and refined question in main.tex, with linked source notes, before handing off. Report the saved locations.

For a full investigation, continue to `research-mind-map` without a stage approval checkpoint. A literature-only request ends with the synthesis. Keep the main document's research status current with evidence links and the next step. Preserve existing LaTeX structure and human edits; use the project build tools to check the updated document and citations. Do not switch panels or open Terminal.app automatically.

Append consequential actions and observed outcomes to root-level research-log.md as this stage proceeds, linking changed stage files, source notes, commands or run evidence. Keep failed actions and revisions visible. Use the existing included stage .tex files when present; main.tex assembles them. Do not duplicate their scientific prose in the activity log.

## Research scratchpad

Use the [shared scratchpad guidance](../research-formulation/references/scratchpad.md) to retain useful findings, questions and ideas in root-level `scratchpad.tex`. Consult relevant entries before the next research decision and record meaningful insights as this stage proceeds. Preserve user notes and distinguish speculative ideas from verified results.
