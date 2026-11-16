---
name: research-setup-baseline
description: "Prepare and verify a research execution environment and reproduce a measured baseline before candidate experiments. Use when starting computational research, changing dependencies, data, evaluator or compute, or diagnosing setup failures."
metadata:
  short-description: "Verify dependencies, compute and a measured baseline"
---

# Setup and baseline

Read the question, resource limits, current plan, repository setup instructions and previous setup evidence. Work in the current project using the existing background command runner. For an existing setup, check whether its interpreter, dependency lock, input files, evaluator and compute still match the proposed experiment before reusing it.

Before preparing dependencies, ensure main.tex contains the authored question and source synthesis and mind-map.json contains the selected ideas. If missing, save those stage outputs first. Write setup/environment.json with status checking as setup begins so its progress has a visible record.

## Prepare the actual execution environment

Start with `python3 setup/probe.py capabilities` when the project provides it. Use its observed executable paths instead of failing `command -v` probes for optional tools. Missing optional tools are not setup failures when an available alternative meets the requirement.

Identify the language/runtime, packages and native libraries, datasets, model weights, evaluator, output paths, hardware and services the proposed method needs. Check the selected execution machine for CPU architecture, available memory and disk, and GPU/accelerator availability when required. For remote compute, also check that the job can access its inputs and write back logs and outputs. Use the user's authorized resources. Resolve missing credentials or paid resources with the user only when needed.

Follow the repository's environment and lock files. Otherwise create a project-local environment appropriate to the language, install the required packages and record resolved versions. For Python, preserve the literal absolute virtualenv path (for example `/project/.venv/bin/python`); never resolve its symlink to the base Python. Use the same explicit interpreter or environment launcher for dependency installation, the smoke test and the experiment command. A package installed in another interpreter does not establish readiness. Keep generated environments, caches and downloaded packages out of Git; retain dependency manifests and locks. Do not modify global packages to repair a project environment.

Run a small check through the actual input loader, algorithm and evaluator on the intended device. Verify imports, input schema and identifiers, reference files, working directory, permissions, finite outputs, and artifact readback. A GPU workload needs a successful small device computation, not just a detected device. A remote workload needs a successful small job on that backend. Record the observed resource use and identify which limits the runner can enforce. Increase workload size only as the checks justify it within any explicit user limits.

Smoke-check the actual isolated worker-launch path and artifact writer through a campaign `kind: setup` attempt. Check a known valid control and a deliberately invalid control where applicable. Verify saved bytes using the real evaluator, including numerical boundaries important to the question. Setup attempts do not require an existing baseline. The coordinator independently validates setup without score promotion. Wait for `validation: passed`, then include that setup `attemptId` in environment checks before marking `status: ready`. Use a setup evaluator that writes `accepted` and a reason; it needs no score.

Here `ready` means the environment and smoke checks passed. Baseline validation is a separate prerequisite for candidates, enforced by the campaign. The environment record may be ready with `baseline: null`; populate that field only after the baseline passes. Keep evaluator acceptance, process completion and baseline quality distinct. Use smoke cost to choose bounded run sizes within any remaining explicit time limit.

## Establish the baseline

Use a provided incumbent or a simple reference method appropriate to the question. Record its exact inputs, evaluator version, metric name, unit and direction. Validate feasibility/correctness before accepting a measured score. A literature score, acceptance threshold, expected value or untested script is not a reproduced baseline. If the research has no numerical objective, specify and execute its reference correctness check instead.

Register the baseline as a planned attempt in the existing `experiments.json`, linked to a baseline topic in `mind-map.json`, with a normal Markdown experiment note and frozen plan. Follow [the experiment file contract](../research-experiment-execution/references/experiment-files.md) for its unique ID, code commit, launch and receipt. Use the same ID through planning and execution. Inspect the actual output and receipt before declaring the baseline usable. Read the execution skill for the runner mechanics without restarting setup recursively.

Write the setup evidence using [the environment record](references/environment-record.md). Link that record and the baseline attempt from `main.tex`. A baseline score may serve as its own reference value for the baseline run; explicitly identify it as the reference run. Candidate runs compare against that validated measurement using the same evaluation ID. Keep a separate acceptance target if the task has one.

If setup fails, retain the command, error and partial outputs. Repair the specific cause, then repeat the failing check. If an attempt has started, give its rerun a new ID and `retryOf`; preserve the failed attempt. If a required resource remains unavailable, record the concrete blocker and continue only work that does not depend on it. Do not launch a larger experiment against an unverified environment or baseline.

## Continue the investigation

For a full investigation, continue to `research-experiment-planning` after the environment and baseline are verified. Carry their exact identities and commands into the candidate plan. Recheck affected setup when dependencies, evaluator, data, device or execution host change. A setup-only request ends with the observed readiness, baseline evidence and any blockers. Use normal project tools to build the updated research document. There is no additional stage approval checkpoint.

Append consequential actions and observed outcomes to root-level research-log.md as this stage proceeds, linking changed stage files, source notes, commands or run evidence. Keep failed actions and revisions visible. Use the existing included stage .tex files when present; main.tex assembles them. Do not duplicate their scientific prose in the activity log.

## Bounded parallel investigations

For computational work, follow the [campaign interface](../research-experiment-execution/references/campaigns.md). When the user supplies no time limit, omit the campaign budget and let research results determine when to stop. Use bounded runs and reassess after each batch; see the campaign interface for stopping criteria. One research agent makes decisions; the coordinator owns dispatch, validation, journal state and accepted best. Preserve failures and non-improvements. Honor explicit deadlines and user stops.

## Research scratchpad

Use the [shared scratchpad guidance](../research-formulation/references/scratchpad.md) to retain useful findings, questions and ideas in root-level `scratchpad.tex`. Consult relevant entries before the next research decision and record meaningful insights as this stage proceeds. Preserve user notes and distinguish speculative ideas from verified results.
