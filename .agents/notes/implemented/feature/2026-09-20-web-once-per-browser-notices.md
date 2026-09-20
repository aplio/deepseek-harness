# Agent Note: Web notices the user answers once per browser

Status: implemented

English | [中文](2026-09-20-web-once-per-browser-notices.zh.md)

## Problem

Two Web surfaces repeated a notice the user had already taken in. The new-chat hero carried its Preview badge on every hero render, and switching the permission preset to Full access opened the shared risk dialog on every switch — from the Settings row, the composer's permission control, and the `/permission` popup — even after the user had checked the acknowledgement. Both notices state a fact about the browser's user rather than about a Session: no later Session makes an earlier answer stale, and a warning that reappears after it was accepted trains users to dismiss it.

## Decision

[`ui-primitives`](../../../../packages/client/ui-primitives/README.md) exports `isRiskAcknowledged(key)` and `acknowledgeRisk(key)` over one `dsh.risk-acknowledged.<key>` localStorage entry per risk. Blocked or absent storage reads as unacknowledged, so the warning stays in place rather than assuming consent, and an acceptance that cannot be recorded stays with the current page.

The Full access gate declares that key. `SelectConfirmation` gained an optional `acknowledgementKey`; the popup shell consults it before opening the dialog and records it when the confirmation settles, and [`ui-permission-presets`](../../../../packages/client/ui-permission-presets/README.md) sets it to the preset id for Full access only. The Settings row, the composer's permission control, and the `/permission` popup therefore share one answer, while Auto review keeps its own gate. The hero's Preview badge claims `dsh.hero.preview-badge` during its first render and paints no badge afterwards.

## Verification

A new `ui-primitives` spec covers recording and reading one key per risk and the blocked-storage path in both functions. `popup.client.spec.ts` proves a keyed gate asks once, records the acceptance on confirm, and settles the next selection in the same browser without the dialog. `permission-select.client.spec.tsx` and `permission-presets-row.client.spec.tsx` reset the key before each case, prove the first switch still demands the acknowledgement, and prove a remembered browser switches directly. `skeleton.client.spec.tsx` proves the hero shows the badge on a first render and hides it on the next one in the same browser. `pnpm run test:gui` covers the assembled client.

## Alternatives considered

- **Storing the acknowledgement in the Host settings document.** Rejected: the fact is browser-scoped, and one Host document is shared by every browser that opens the same profile.
- **Removing the Full access warning.** Rejected: the first switch still needs an explicit acknowledgement; only the repeat is noise.
- **Keying the acknowledgement per surface.** Rejected: the three surfaces warn about the same preset, and three keys would ask three times.
- **Remembering it per Session.** Rejected: a new Session would re-ask a question about the user's standing answer.
- **Removing the hero badge outright.** Rejected: it is the product's pre-stable marker on a first visit; the request was to stop repeating it, not to drop it.
- **A generic notice registry in the shell.** Rejected: two call sites do not justify a registry, and both already own their persistence keys.

## Consequences

- A browser that accepted the Full access warning switches presets without the dialog, including from another profile served on the same origin; clearing site data restores the warning.
- The hero badge shows once per browser per origin.
- The three Full access surfaces cannot diverge: they read one key.
- Auto review keeps asking on every selection, because its gate covers a different grant.
- No model-visible surface, session event, or Host document changes.
