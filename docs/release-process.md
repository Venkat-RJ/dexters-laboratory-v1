# Public release preparation

Product: **Dexter's Laboratory V1**. Initial version: **1.0.0**.

This source folder has no inherited Git history and no automatic publishing
workflow. Preparing it does not commit, push, publish or distribute an application.

## Before the first public commit

1. Review the complete source and staged diff for private material. Keep research
   archives, conversations, credentials, runtime caches and local reports out.
2. Run `python3 scripts/audit-public-source.py`. Its checks are a guard, not proof
   that every possible secret or confidential statement has been detected.
3. Keep LICENSE, NOTICE and third-party licenses. Review unresolved dependency
   licensing entries in THIRD_PARTY_NOTICES.md.
4. Run the relevant frontend and native checks documented in CONTRIBUTING.md.
5. Configure the actual repository URL and a private vulnerability-reporting
   channel after choosing the repository. No public URL is assumed here.
6. Review and commit only when the owner explicitly requests it.

## Before distributing a binary

Build from the reviewed public source in a clean environment. Do not reuse a
private development bundle: it may contain private templates or runtime data.
Leave `LATTICE_PRIVATE_FONTS_DIR` unset. Public builds require explicit opt-in
before loading any private fonts and do not compile in a provider credential.

Prepare the pinned Synara source and regenerate dependency notices for the actual
bundle. Resolve the documented Trellis/GPUI compatibility and external icon
provenance questions for the components you ship. The existence of source code
does not establish permission to distribute every possible combined binary.

Verify a fresh research project, provider setup, a bounded test, validation,
tracker, Charts, mind map, Versions and PDF in that exact build. Record observed
results and remaining failures. Configure your own signing and notarization.
The default ad-hoc build is not a signed public release.

Automatic updater endpoints are empty and no updater artifacts are produced.
If updates are added later, use new signing keys and an owner-controlled endpoint.
Do not restore upstream update signing or publishing settings.

Historical architecture documents may describe upstream infrastructure. Those
URLs identify upstream Lattice, not services or releases owned by this fork.
