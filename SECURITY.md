# Security and privacy

Dexter's Laboratory V1 is a local desktop research workspace. The agent and
experiment workers execute code with your user account's permissions. They are
not an operating-system sandbox. Use normal tool permissions and inspect
untrusted projects, scripts, skills and TeX before running them.

## Data boundaries

- Research files live in project folders. Provider requests may send selected
  context to the provider you configure. Anonymous literature queries can also
  use the inherited upstream Lattice literature proxy. Local storage does not mean all work
  happens offline. Search, citation, GitHub and Overleaf features use network services.
- Credentials must be configured locally. Public builds do not embed a shared
  developer Firecrawl credential. Automatic upstream updates are disabled.
- Overleaf session storage is permission-restricted, not encrypted in the OS
  keychain. Treat app data and logs as private.
- New project `previous-research.md` files are ignored by Git. Copies in other
  files, previously tracked data and agent messages are not protected by that rule.
- The public source omits private archives, sessions and compiled applications.

## Reporting

Do not put credentials, private research or exploit details in public issues.
For sensitive reports, use GitHub private vulnerability reporting when available
or an existing private channel with the repository owner. Do not use a public
issue for confidential details.

See [architecture](docs/architecture.md) for process boundaries and
[release preparation](docs/release-process.md) for distribution checks.
