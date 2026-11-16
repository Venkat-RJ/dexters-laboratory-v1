# Dexter's Laboratory V1

A local research workspace built on [Lattice](https://github.com/leo1oel/lattice).

Source repository:
[Venkat-RJ/dexters-laboratory-v1](https://github.com/Venkat-RJ/dexters-laboratory-v1).
Private research and knowledge are not included.

Start with a problem. Develop the formulation, search prior knowledge, map possible
directions, establish the environment and baseline, design experiments, validate
results, and write the research record in `main.tex`.

## What is included

- Research skills for formulation, prior knowledge, mind maps, setup and baseline,
  experiment design, execution, and analysis.
- A visible project template with stage TeX files, a research log and scratchpad.
- A branching mind map linked to experiments, with agent-assisted review.
- Design of Experiments for plans, attempts, live execution and validation status.
- Local campaign execution with isolated attempts, bounded runs and recovery records.
- Overall Charts for validated progress across attempts.
- Markdown experiment notes, Git Versions and exact commit links.
- LaTeX editing, bibliography tools and PDF preview inherited from Lattice.

One research agent plans and interprets the work. Parallel workers execute attempts.
A process exit, a valid measurement and a scientific conclusion are separate things.
The workflow can revisit earlier stages when evidence changes.

## Start a research project

Create a **Research workspace** in the desktop app, configure your agent provider,
and describe the problem in Agent chat. For example:

```text
Investigate [problem]. Use the research skills and keep the stage files,
research log and scratchpad current. Search prior knowledge, map directions,
verify setup and a baseline, then run useful bounded experiments. Validate
saved results, compare them and update main.tex and its PDF.

Use local compute. Respect these constraints: [your constraints].
```

New projects start with empty experiment records and unverified setup. They do not
install dependencies or begin experiments until the agent performs those steps.
If you supply no overall deadline, the agent uses bounded runs and reassesses at
batch boundaries. This is not a guarantee of automatic convergence or useful results.

## Build from source

This is the V1 **source preparation**, not a signed binary release.
The primary desktop target is macOS 14 or later. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the pinned tools, Synara checkout and commands.
Provider credentials and LaTeX tools are configured locally. No account, private
research, provider key or prebuilt runtime is included.

## Records and privacy

Research projects are ordinary folders. `main.tex` includes the stage documents.
`research-log.md` records consequential actions and failures. `scratchpad.tex`
keeps ideas for later. Attempt notes, receipts and saved artifacts retain evidence.

`previous-research.md` is an empty structured starter in new projects and is
Git-ignored there. Ignoring a file does not protect material copied into another
file or sent to an agent provider. Review your project before sharing it.
See [SECURITY.md](SECURITY.md) for the local execution and data boundaries.

## Documentation

- [Research workflow](docs/research-process.md)
- [Fork architecture and code ownership](docs/dexter-laboratory.md)
- [Underlying architecture](docs/architecture.md)
- [Codebase map](docs/codebase-map.md)
- [Public release checklist](docs/release-process.md)
- [Preparation checks and limitations](docs/public-preparation.md)

## Status and limitations

V1 is a research workbench, not a guarantee of scientific correctness. Evaluators,
source quality, provider access and environment readiness remain problem-specific.
Legacy results without validation evidence must not become trusted best results.
Local execution does not continue after the application exits. Remote scheduling
and multiple agents editing a shared campaign are outside this implementation.

Private research archives, local acceptance reports, conversation history,
credentials, proprietary fonts and private character artwork are excluded from
this source preparation. Automatic upstream updates and publishing workflows
are disabled. The public app has its own application identifier.

## Attribution and licenses

This is a modified Lattice application, not an official Lattice release.
Original notices and licenses remain in [LICENSE](LICENSE), [NOTICE](NOTICE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Internal Lattice names are retained
where they describe inherited code and protocols.

Uses Trellis by DanFessler: [github.com/DanFessler/trellis](https://github.com/DanFessler/trellis).
The main source is Apache-2.0; separately licensed components retain their own terms.
Trellis, tldraw, the optional GPUI shell and external Synara assets have distinct
licensing considerations. Review the unresolved entries in the third-party notices
before distributing binaries or using restricted components commercially.
