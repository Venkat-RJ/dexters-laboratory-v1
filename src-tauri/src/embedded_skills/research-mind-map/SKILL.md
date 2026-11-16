---
name: research-mind-map
description: "Build or revise a source-grounded branching mind map to understand a problem, explore prior knowledge and develop possible directions. Use for knowledge exploration and when findings change understanding."
metadata:
  short-description: "Explore knowledge, relationships and directions"
---

# Research mind map

Read the formulation, prior-knowledge synthesis, source notes and any existing map. Create a branching map of the problem in project-root `mind-map.json`. Lattice lays out the branches automatically. Focus on problem-specific concepts, constraints, candidate methods, evidence and open questions. Give each topic a short label.

Use Laboratory's version 1 format. Order topics in depth-first order: the central question is the only depth 0 topic, its immediate branches have depth 1, and children follow their parent with one greater depth. Each topic has a stable `id`, a `label`, a `depth` and an optional `role` of `evidence`, `hypothesis` or `test`.

```json
{"version":1,"topics":[
  {"id":"question","label":"Can the packing be made smaller?","depth":0},
  {"id":"methods","label":"Candidate methods","depth":1},
  {"id":"border","label":"Boundary arrangements","depth":2},
  {"id":"limits","label":"Certification limits","depth":1}
]}
```

Edit the JSON with normal project file tools. Preserve existing IDs, human edits and legacy fields. Use a Markdown link as a topic label when a project evidence file should open from that topic. Link to the project-relative file path only: the current Open source action does not resolve #section fragments. Keep section locators and topic-to-source mappings inside the linked note. Link to the map from the research manuscript. When planning an experiment, link its record to the specific hypothesis or method by topic ID. Update the relevant branch when findings change the investigation. Experimental measurements stay in the experiment evidence. The manuscript records their interpretation.

Build understanding before narrowing directions. Develop problem-specific branches for concepts, subproblems, known approaches, assumptions, limitations, relationships and open questions as relevant. These are coverage prompts, not mandatory headings. Recursively expand a branch when its label conceals meaningful distinctions: explain how a method works, its variants, where it applies, its limitations and connections to other ideas. Keep detailed explanations and source locators in existing source notes and the included mind-map/prior-knowledge sections; use short labels on the map.

Alternate mapping with `research-prior-knowledge`: new sources reveal branches, and thin or uncertain branches reveal what to investigate next. Preserve distinct alternatives and disagreements. Mark unsupported possibilities as proposals and inaccessible sources as unverified leads. Depth should reflect the subject, without arbitrary node counts, uniform depth targets or repeated filler. Continue while searches add meaningful knowledge; finish with a coverage summary and explicit remaining gaps rather than claiming exhaustiveness.

The mind map organizes knowledge and directions. Nodes do not require experiments, scores, hypothesis/test roles or runnable proposals. Keep experimental selection, protocols, attempts and measurements in Design of Experiments. When an experiment is later planned, its record references the relevant stable topic ID; many experiments may reference one topic and most topics may have none. Existing linked run summaries are secondary context. A failed attempt does not establish that an entire direction is wrong. Update knowledge only to the extent supported by the findings, and do not create a node for every attempt or optimizer iteration.

Preserve existing IDs, human edits, legacy roles and experiment links as the map grows. Use ordinary topic nodes for concepts and methods; optional roles describe content only when appropriate. Express relationships between branches in linked notes using topic IDs rather than inventing unsupported graph fields.

Build the map from the recorded searches and source synthesis, including all three prior-knowledge passes. Every substantive branch should connect to source-backed explanation or be explicitly marked as a proposed direction or unresolved question. Consult sources/search-plan.md for unexamined areas; do not expand from labels alone.

Before declaring the map ready, delegate a focused review to one subagent in the existing runtime using the [status and review contract](../research-prior-knowledge/references/research-status.md). Have the reviewer check the saved map against primary-source extracts and synthesis without editing files. The main agent records findings, revises and requests a recheck. Save the actual subagent ID and returned verdict in a review receipt tied to the final evidence. Use the existing provider and account; do not use the isolated text-generation service. Preserve experiment links and old receipts; no new provider or approval gate is needed. Use `scripts/review_snapshot.py PROJECT_ROOT` to compute the evidence identity, not to decide the verdict.

Save and read back mind-map.json as branches develop. Check parent/depth order, distinct labels, source links and meaningful coverage. Announce the saved map in Project. For a knowledge- or map-only request, finish with the reviewed map, synthesis and remaining questions; do not launch setup or experiments. For a full investigation, complete the requested exploration before continuing to `research-setup-baseline` without a stage approval gate. Experiment design then selects from the mapped directions.

Append consequential actions and observed outcomes to root-level research-log.md as this stage proceeds, linking changed stage files, source notes, commands or run evidence. Keep failed actions and revisions visible. Use the existing included stage .tex files when present; main.tex assembles them. Do not duplicate their scientific prose in the activity log.

## Research scratchpad

Use the [shared scratchpad guidance](../research-formulation/references/scratchpad.md) to retain useful findings, questions and ideas in root-level `scratchpad.tex`. Consult relevant entries before the next research decision and record meaningful insights as this stage proceeds. Preserve user notes and distinguish speculative ideas from verified results.
