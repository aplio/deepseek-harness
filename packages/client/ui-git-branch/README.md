---
description: "Composer stats-row and question-card git chip for the web GUI, plus the sidebar brand-row notice that the running checkout is behind its fork origin: the checkout the current Session workspace lives in — GitHub repository, branch, and worktree directory — read over the workspaceGit Remote namespace."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-git-branch

English | [中文](README.zh.md)

## Summary

This package renders the composer stats-row and question-card git chip naming the Session workspace's checkout, and a sidebar brand-row badge reporting that the installation running the page is behind its fork origin. Page-lifetime controllers poll the Host's [`workspaceGit`](../../api/workspace-git/README.md) Remote namespace while visible and publish snapshots their components read. A GitHub `origin` makes the chip read `owner/repo:branch (worktree)`, dropping a worktree directory that repeats the repository name; a detached HEAD reads `owner/repo@abc1234 (worktree)`. Outside a repository, an unavailable git, and a failed read, nothing renders.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this plugin beside [`dsh-api-workspace-git`](../../api/workspace-git/README.md), [`dsh-client-ui-chat`](../ui-chat/README.md) and [`dsh-client-ui-user-questions`](../ui-user-questions/README.md) (which declare the two chip seats), [`dsh-client-ui-sidebar`](../ui-sidebar/README.md) (which declares the badge seat), and the conversation surface; the chip then appears on the stats line of every Session whose workspace is a repository, and in the question card's header while a takeover hides that line, while the badge appears beside the sidebar's local-build label when the installation checkout is behind. The plugin takes no configuration.

### What to expect

The chip is read-only: behind the branch glyph it reads the checkout's GitHub repository and ref, followed by the worktree directory that holds it unless that directory repeats the repository name, and the tooltip and screen-reader label name the role ("Branch shiguredo/moqt-js:main (worktree moqt-js)"). With a GitHub remote the whole chip is a link that opens `https://github.com/<owner>/<repo>` in a new tab, wearing the same hover and focus affordances as the stats pills beside it; without one it stays a plain reading. It renders nothing before the first answer, outside a repository, and when the remote names no GitHub repository — the worktree directory still shows then. The row holds its place for the chip even before the Session's first figures exist, and a contentless row stays out of the layout. A composer takeover (a question or a plan review) hides the stats row with the input bar, so the question card's header carries the same chip; both mounted chips share one watch per Session. Unloading the plugin removes the chip, the controller, and its timer.

The brand-row badge is a download glyph followed by the commit count when the Host reported one, and carries the count or the count-less sentence as its tooltip and screen-reader label; it renders nothing while the relation is `current`, `none`, `unknown`, or not yet read. It sits inside the brand row's New Session button, which the sidebar marks `aria-hidden`, so it is a visual notice rather than a control, and it names the installation serving the page rather than the Session you are reading — the sidebar's local-build label beside it describes the same code.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin registers one `GitBranchChip` occupant into each lead seat — ui-chat's stats row and ui-user-questions' question card header — and one `UpstreamBadge` occupant into ui-sidebar's brand row, plus one dictionary effect. The stats row mounts with the composer and collapses through `:has` while neither a pill nor the seat contributes content, so the chip is not gated on the first closed step; the question card's header collapses its lead line the same way. The chip calls `acquire(sessionId)` on mount and `release(sessionId)` on unmount through its inject face; the controller counts the mounted chips per Session, so its single interval and its `visibilitychange` listener start with the first watch and stop with the last release. Reads are at most one in flight per Session, a repeat poll while one is in flight is skipped rather than queued, and each settlement is fenced by the watch generation, so a released or re-acquired Session drops late answers. A failed read keeps the last published answer, and an unchanged answer publishes nothing, so the store's snapshot identity moves only when the checkout does — the ref, the worktree directory, or the repository.

The badge's controller watches no identity: one page has one installation, so it starts its own 30-minute interval on plugin activation and ends it with the plugin fiber. It publishes an answer only when the displayed relation changes, which is the kind, the upstream repository slug, and the commit count; a read that fails, that reports no value, or that settles after disposal leaves the published answer alone. The Host's own `checkIntervalMs` cache is what keeps those reads off the network.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the chip alone is not enough; they move from the browser entry to its data and the composition model.

- [dsh-api-workspace-git](../../api/workspace-git/README.md) — the Host service this chip polls.
- [dsh-client-ui-chat](../ui-chat/README.md) — the stats row that declares the chip's first seat.
- [dsh-client-ui-user-questions](../ui-user-questions/README.md) — the question card that declares the chip's takeover seat.
- [dsh-client-ui-sidebar](../ui-sidebar/README.md) — the sidebar shell that declares the badge's brand-row seat.
- [Slots reference](../../../docs/subsystems/slots.md) — how a plugin registers into another plugin's declared slot.
- [Web client architecture](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md) — how browser plugin rows load and register slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the chip is browser chrome over a working-directory fact and touches no prompt, message, schema, or tool result.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the current chip and badge and what they deliberately do not do.

- **Polling is time-based** — a branch or worktree switched in a terminal while the page stays visible appears within one poll interval (15 seconds), not at the moment of the checkout, and an installation update appears within the badge's 30-minute interval.
- **One read per watched Session** — the controller does not coalesce two Sessions on one workspace, so two Sessions on one repository cost one git read each per poll.
- **The chip and badge report, they do not act** — no branch switch, copy, update, or history surface is offered; the badge is not even interactive, because the sidebar brand row is already a New Session button.
- **The badge names the installation, not the Session** — it reports the checkout the running dsh came from, so it says nothing about the repository the Session you are reading works in.
- **The worktree name is a directory base name** — a workspace nested inside a repository reports the checkout root's directory, and two checkouts sharing a base name read alike.
- **No link without GitHub** — a remote on another host leaves a plain chip; the repository URL is never guessed from the directory name.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The plugin owns three slot registrations and one dictionary effect whose disposal the HMR-safety spec proves, and each controller's published snapshot is its only cross-render state, with no independent observation to diverge from it.
