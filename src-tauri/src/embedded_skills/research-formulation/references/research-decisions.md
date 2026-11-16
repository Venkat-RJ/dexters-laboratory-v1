# Research decisions

Use this guide when framing the question, selecting tests or interpreting a batch. Record the reasoning in the existing manuscript and experiment notes, not a new workflow or mandatory checklist document.

## Preserve the question

State the intended contribution and the scope evidence would support. A small case can test feasibility or isolate a mechanism; explain how it relates to the actual objective. Preserve the user's research priorities when selecting among useful questions. Use source review to refine unknown definitions and baselines before committing to comparisons. Record substantive revisions and why they changed.

## Select useful work

For the strongest plausible explanations, identify a result that would distinguish them. Choose a test whose outcomes could change the next decision. Weigh likely learning, feasibility and observed cost. Prefer strong, fairly configured references and check that the metric measures the intended property. Controls, ablations, counterexamples, proofs and replication can be more useful than another optimization sweep.

Separate scientific uncertainty from broken infrastructure. Repair a concrete setup failure before retrying dependent work. Invalid candidates remain research evidence. They are not automatically infrastructure failures.

## Interpret and continue

At a batch boundary, state what was observed, what belief or approach changes, the remaining alternative and the next action with its reason. Use the campaign's fixed baseline, accepted best, branch results, failures and remaining time. Keep scientific outcome distinct from promotion to current best.

A search has two scales. A solver may evaluate many proposals inside one attempt. The research agent chooses methods and meaningful experiments across attempts. Preserve proposal traces without generating a note, commit or map node for every iteration. Record the parent candidate separately from the fixed reference baseline.

A plateau invites a different test, branch, restart or stop with a reason. Keep a validated fallback during exploration. For noisy measures, replicate or aggregate under a declared evaluation policy before asserting improvement. Account for adaptive selection, repeated comparisons and held-out contamination when making inferential claims. Deterministic geometry may need exact or interval verification rather than statistical significance.

Conclude at the scope the evidence supports. A valid improved artifact is not automatically a generally superior algorithm. Lack of improvement is not a proof of impossibility. Check the strongest opposing explanation before final reporting. The existing research-writing references provide further claim and argument audits when preparing the paper.

## Preserve continuity

At decision boundaries update Research status in main.tex with the question, current evidence, uncertainty, next action or stop reason. Link the relevant notes, source evidence and map branch. Freeze plans for executed attempts. Inspect existing campaign state after interruption, reconcile before resume, and never duplicate completed measurements. The app's continuation binds to the same workspace and conversation; it must respect user Stop and permission waits.
