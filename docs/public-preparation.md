# V1 public source preparation

Prepared on 2026-11-16. The initial source preparation did not create a repository,
commit or publish the source. The owner subsequently authorized an initial commit
and push to the separate private repository `Venkat-RJ/dexters-laboratory-v1`.
This report covers source preparation, not packaged-app acceptance.

## Scope

- Product name: Dexter's Laboratory V1; version: 1.0.0.
- Separate application identifier: `app.dexterslaboratory.v1`.
- No inherited Git history, private research archive, conversation state or local
  acceptance reports in the export.
- Neutral previous-research starter. New project copies remain Git-ignored.
- No build-time provider credential and no automatic private-font discovery.
- Flask companion replaces excluded private character artwork.
- Report a Problem saves a redacted local report without opening an upstream issue.
- Upstream attribution, licenses and dependency notices retained.
- Automatic updates and publishing workflows disabled.

## Observed checks

| Check | Result |
| --- | --- |
| Application and tooling TypeScript checks | Passed |
| Focused frontend tests | 40 passed across 7 files |
| Native project-template tests | 6 passed; 1 full-template TeX test ignored |
| Native literature-credential tests | 4 passed; 1 keychain test ignored |
| Optional GPUI font-selection function | Explicit opt-in check passed in an isolated Rust harness |
| Production web bundle | Passed |
| WebKit compatibility guard | Passed |
| Startup size guard | 1,447,303 eager JS bytes, below 1,468,006 limit |
| Source and generated-web credential/private-reference scans | No flagged content after review |

The full GPUI application, full repository suite, external-runtime packaging,
signed installer and end-to-end desktop research flow were not revalidated in this
public-preparation pass. The isolated font check is not a GPUI application build.
Generated web output and temporary dependency links were removed from the source
folder after checking them.

## Reproduction

Follow CONTRIBUTING.md for dependency setup, then run:

```sh
python3 scripts/audit-public-source.py
pnpm exec tsc --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm exec vitest run scripts/private-fonts.test.ts src/app/native-locale.test.ts src/app/report-problem.test.ts src/editor/research/chart-progress.test.ts src/editor/research/research-links.test.ts src/editor/research/experiments-view.test.tsx src/editor/research/research-navigation.test.tsx
cargo test --manifest-path src-tauri/lattice-core/Cargo.toml project::create
cargo test --manifest-path src-tauri/lattice-core/Cargo.toml literature_credentials
pnpm exec vite build
node scripts/check-webkit-compat.mjs
node scripts/app-size-report.mjs --check
```

Pattern scans are limited. They do not establish that every confidential fact or
unknown credential format has been detected. Review the actual source before
publishing and audit the exact binary separately before distribution.

See [release-process.md](release-process.md) for remaining distribution and
repository-configuration steps, including dependency licensing and private
vulnerability reporting. The repository remains private; no public release has been made.
