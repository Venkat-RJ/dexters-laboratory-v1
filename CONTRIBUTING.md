# Contributing to Dexter's Laboratory V1

This fork builds on Lattice. Preserve upstream attribution and dependency licenses.
Do not include private projects, agent sessions, credentials or generated runtimes
in a patch. See [SECURITY.md](SECURITY.md).

## Development setup

The primary target is macOS 14 or later with Xcode Command Line Tools, Rust via
rustup, Git, Node 22 and pnpm 10.13.1. `mise.toml` pins Node and pnpm.
The agent runtime bundles its separately pinned Node version.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
```

Desktop development also needs the external Synara source at the revision in
`scripts/synara-runtime.json`. Read that file rather than selecting a moving branch.
The following commands create the default sibling checkout on a fresh machine:

```sh
git clone https://github.com/leo1oel/synara.git ../synara-v152-sync
git -C ../synara-v152-sync checkout b14fd35abc28b224c02cf9b0eb809f3984683715
mise exec -- pnpm tauri dev
```

If that checkout already exists, inspect it first; do not reset someone else's work.
`SYNARA_SOURCE_DIR` can select another checkout at the same pinned revision.
Runtime preparation applies the checked-in integration patches. If the pinned
external source is unavailable, the desktop agent cannot be built from this source
alone. Frontend checks do not require the sidecar.

Configure your installed provider CLI/account locally. Use TeX doctor in the app
for document tools. No private fonts or build-time provider credentials are needed.

## Checks

```sh
pnpm exec tsc --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm test
pnpm build
cargo test --manifest-path src-tauri/lattice-core/Cargo.toml project::create
```

For app-shell Rust tests without preparing the sidecar, create an ignored
`src-tauri/synara-runtime/placeholder.txt`. This is a test resource, not a runnable
agent. The frontend dev server alone is also not the complete desktop app.

Use focused tests during edits, then check the affected boundaries. Read
[docs/agent-validation.md](docs/agent-validation.md) for the inherited validation
workflow and [docs/codebase-map.md](docs/codebase-map.md) for ownership.

## Local packaging

```sh
pnpm tauri build
```

Build only after preparing the pinned external runtime and reviewing the
[release checklist](docs/release-process.md). The default macOS identity is ad hoc,
not notarized. No workflow publishes this source snapshot automatically.

Keep generated environments, runtime packages, worktrees and user evidence out of
source control. Report which checks actually ran; do not label a simulated fixture
as a completed scientific experiment.
