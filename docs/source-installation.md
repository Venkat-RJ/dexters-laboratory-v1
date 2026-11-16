# Source installation check

Checked on 2026-11-16 using a new HTTPS clone on macOS 27.0.1, Apple silicon.
The proposed setup files were applied to that clone before running the command.
No dependency directory, Synara checkout, prepared runtime or Cargo build output
was copied from the private development workspace.

## Observed results

- `./scripts/setup.sh` obtained the checksum-verified mise executable and prepared
  Node 22 and pnpm 10.13.1 from `mise.toml`.
- The locked Dexter and Synara dependencies installed. Synara was fetched at the
  exact public revision from `scripts/synara-runtime.json`.
- The agent runtime dependency checks and presentation runtime checks passed.
- TypeScript, production frontend build, WebKit compatibility, startup size and
  size-guard self-tests passed during the local app build.
- Tauri built the local debug `.app`, and setup opened it and exited successfully.
- In that app, the tutorial rendered, a new Research workspace opened with its
  stage files, the PDF displayed, the neutral knowledge starter opened, and the
  bundled agent panel rendered its research prompt.
- The new project's `previous-research.md` was confirmed Git-ignored.
- A second `./scripts/setup.sh --no-run` succeeded using the managed checkout even
  with a conflicting `SYNARA_SOURCE_DIR` in the caller's environment. The pinned
  checkout remained clean.
- Six checkout tests passed, including repeat setup, paths with spaces, preserving
  local changes, wrong repository/revision refusal and invalid pin rejection.

## Reproduce

Follow the README's clone and setup commands. For the focused safety checks:

```sh
node --test scripts/setup-source.node-test.mjs
bash -n scripts/setup.sh
./scripts/setup.sh --no-run
```

## Limits

This was a fresh repository clone on an existing developer machine, not a wiped
Mac. Rust, Apple developer tools and LaTeX were already installed. The missing-Rust
bootstrap branch and the installation of Apple or TeX tools were not exercised.
Intel Macs, macOS 14 and non-macOS platforms were not tested in this pass.

No paid model request or research experiment was run. Provider authentication and
paper tools remain first-use steps. The local app is a development build with an
ad-hoc signature, not a notarized distribution. Setup does not commit or publish your
project. No app installer or compiled runtime is committed to the repository.
