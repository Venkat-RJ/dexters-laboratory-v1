# Dexter's Laboratory: code and records

This fork extends Lattice's Tauri, React and Synara workspace. Existing editor,
PDF, bibliography and Git history components remain the foundation.

| Responsibility | Owning source |
| --- | --- |
| Seven research skills and project templates | `src-tauri/src/embedded_skills/research-*` |
| New-project file creation | `src-tauri/lattice-core/src/project/create.rs` |
| Research starter prompts and host integration | `src/app/use-synara-host.ts`, `scripts/synara-research-starters.patch` |
| Research stage state and Dexter pet | `src/app/use-research-status.ts`, `src/app/laboratory-pet.tsx` |
| Tracker, experiment notes and campaign controls | `src/editor/research/` |
| Native campaign IPC | `src-tauri/src/research_campaign.rs` |
| Campaign coordinator and execution | `src-tauri/src/embedded_skills/research-experiment-execution/scripts/` |
| Attempt and validation records | `src-tauri/lattice-core/src/experiment_tracker.rs` |
| Agent continuation | `src/agent/campaign-continuation.ts` |
| Git commit and experiment links | `src/history/commit-experiments.tsx` |
| Brand, application title and packaged icons | `src-tauri/tauri.conf.json`, `src-tauri/icons/`, `src/app/native-locale.ts` |

Read `research-process.md` for the workflow and `architecture.md` / `codebase-map.md`
for underlying editor, native IPC and window ownership. Acceptance documents record
particular checks, not universal guarantees about every future run.

## Research privacy

The public template contains no imported research. Each new project has a neutral
`previous-research.md` starter that is ignored by Git. Users may supply their own
knowledge locally. An ignore rule does not protect copies made into other files.
Keep private evidence and credentials out of shared manuscripts and repositories.

The public source uses a flask companion instead of private character artwork.
Its activity label still follows the research state.
