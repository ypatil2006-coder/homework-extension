# Backend Answer Format Plan

Goal: Return requested single-file backend source code without a shell wrapper or unrelated API features.

- [x] Trace backend prompts and answer rendering. Check: identify the terminal instruction and one-file parser path.
- [x] Add a failing example for one-file shell output and requested stack. Check: regression fails before the change and passes afterward.
- [x] Preserve one-file source in the answer view and constrain backend prompts to the stated API contract. Check: multi-file behavior remains intact.
- [x] Run all tests, syntax checks, and `git diff --check`.
