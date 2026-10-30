# Fork maintenance

## 2026-10-30 — 26.10.30-lhg

- Fork base: `65c70a187dd8ee84b9a8504df2b288f754658463` (0.8.2).
- Upstream: `copylee711/dsh-computer-use`, published version 0.8.1, commit [`a29a8bb741c6befa295005ea627a3beaf70b75ba`](https://github.com/copylee711/dsh-computer-use/commit/a29a8bb741c6befa295005ea627a3beaf70b75ba).
- Selectively absorbed the Chromium UIA fix and its regression/smoke tests. This is functional absorption, not a merge or a claim that the upstream SHA is a Git ancestor. Upstream adapted and superseded [PR #3](https://github.com/copylee711/dsh-computer-use/pull/3); we did not merge that PR unchanged.
- Chromium/Electron accessibility is awakened while preserving browser controls. Bounded top-level collection keeps renderer results when a provider stalls; duplicate nodes are removed. Supported web editors keep the existing Edit/input aliases, with automationId/focusable/editable exposed to the model.
- Preserved fork on-demand Windows skill, concise resident instructions, existing permission policy and all other tools. MIT license and Copy attribution are unchanged; original PR contributor haoren153 is credited by the upstream commit.
- Local validation: typecheck; 130 tests across 15 files; build; existing pack:check; smoke-script syntax; diff whitespace check. Generated `lib/index.js` and `lib/types/target.d.ts` match the updated source. The pnpm lockfile has no root package version field and dependencies are unchanged.
- Windows evidence for the exact upstream source: [CI run 40860587273](https://github.com/copylee711/dsh-computer-use/actions/runs/40860587273) passed Windows helper compilation/ping and Linux verification. [Maintainer validation](https://github.com/copylee711/dsh-computer-use/pull/3#issuecomment-6494706227) reports isolated real-Chrome, Notepad and timeout/failure-injection checks. The fork candidate helper is byte-identical to that upstream helper. No local Windows GUI/DSH end-to-end run was performed in the Linux workspace; this evidence does not imply one.
- No npm publication, release archive upload, workflow or account/permission changes.
