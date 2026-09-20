# Agent Note: The narrow-frame sidebar dismisses itself on navigation

Status: implemented

English | [中文](2026-09-20-web-narrow-frame-sidebar-dismissal.zh.md)

## Problem

Below 1024px the frame keeps the sidebar as a grid track rather than an overlay: the narrow default is the 56px rail, and expanding it takes width from the conversation. Picking a Session from that list left the list open, so a phone user needed a second tap on the toggle to see the conversation just chosen — and that second tap sits inside the browser's double-tap-zoom window, so the two gestures raced. The list is the navigation surface; keeping it open after a selection serves nobody on a frame where it spends the width it takes.

## Decision

The sidebar's own gestures call `ctx.layout.collapseSidebar()`, which clears only the narrow expansion override: [`ui-workspace`](../../../../packages/client/ui-workspace/src/client/index.ts) wraps the browser's session-open and New Session callbacks, and [`ui-sidebar`](../../../../packages/client/ui-sidebar/src/client/index.ts) wraps the shell's New Session action. The seam is the gesture rather than `UiWorkspaceService.replaceMain`, so a Session restored at boot or selected from anywhere else leaves the shell exactly as the user left it. A wide frame's preference is untouched either way, so a desktop browser keeps the open state and width the user set. The sidebar column also declares `touch-action: manipulation` in [`SidebarRoot.module.css`](../../../../packages/client/ui-sidebar/src/client/SidebarRoot.module.css), which keeps list panning and pinch zoom while reserving the double-tap gesture for the controls inside the column instead of browser zoom.

## Verification

`layout-store.client.spec.ts` proves `collapseSidebar` drops the narrow override, keeps the width preference, and leaves a wide frame's open sidebar alone. The `ui-workspace` apply spec proves each browser gesture — both New Session arms and a session open — collapses once through the real `LayoutController`, and the `ui-sidebar` apply spec proves the shell's New Session action does the same. `pnpm run test:gui` covers the sidebar and workspace suites.

## Alternatives considered

- **`user-scalable=no` in the viewport meta.** Rejected: it also removes pinch zoom from transcripts and diagrams, which the frame has no reason to take away.
- **Closing the sidebar on any pointer-down inside it.** Rejected: it would also close on a scroll gesture and on the row menus.
- **Collapsing only when the sidebar overlays the conversation.** Rejected: no overlay presentation exists today; the narrow frame squeezes the centre, so the dismissal is wanted in the same cases.
- **Collapsing from `UiWorkspaceService.replaceMain`.** Rejected: the boot restore and every non-sidebar caller commit through it, so a restored Session would close a sidebar the user had just opened.
- **Collapsing on the Session selection store instead of the navigation commit.** Rejected: the store also publishes restored and externally archived selections, which are not user navigation.

## Consequences

- One tap on a Session row switches the conversation and reveals it.
- A narrow-frame user cannot pick two Sessions in a row without reopening the sidebar.
- Desktop behaviour is unchanged, including the manual toggle and the saved width.
- Double-tap inside the sidebar no longer zooms the page; pinch zoom and list panning still work.
- The rule follows the sidebar's own gesture, so a restored or externally driven selection never closes a sidebar the user did not leave.
