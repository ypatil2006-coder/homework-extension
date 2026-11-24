# Audit Fixes Implementation Plan

**Goal:** Resolve the twelve concrete bugs reported in the repository audit.

**Architecture:** Keep the extension's existing files and APIs. Move only shared key allocation into the background worker, where requests from tabs can be serialized.

**Acceptance checklist:**

- [x] Preserve saved keys and prevent a failed capture from switching windows; verify with focused worker checks.
- [x] Require consent for starring and make answer selection parse, scope, and report clicks correctly; verify with selection regressions.
- [x] Make backup, restore, and update actions report what they actually do; verify with updater regressions.
- [x] Make key tests use the chosen model and serialize rotation across tabs; verify with focused checks.
- [x] Run every existing test, new regressions, syntax checks, and inspect the final diff.
