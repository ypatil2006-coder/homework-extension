# Multi-File Terminal Command Plan

Goal: Make the optional command create the requested files in the current project directory without misreading source as shell syntax or writing outside that directory.

- [x] Reproduce failure for code containing `EOF`. Acceptance: execution test fails against the old generator.
- [x] Quote paths and choose a delimiter absent from each file. Acceptance: awkward filenames and delimiter lines write exact code.
- [x] Reject parent paths and symlinks. Acceptance: no outside file is written.
- [x] Keep writes in the current directory. Acceptance: a nested project inside a Git repository receives the files.
- [x] Run the full suite, JavaScript syntax checks, and diff check.
