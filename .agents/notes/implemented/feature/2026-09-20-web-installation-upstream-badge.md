# Agent Note: The Web sidebar reports when the running checkout is behind its fork origin

Status: implemented

English | [中文](2026-09-20-web-installation-upstream-badge.zh.md)

## Problem

The checkout a person runs dsh from drifts behind the fork origin it was taken from, and nothing in the GUI says so; finding out meant leaving the GUI for a terminal. The sidebar already names the running build — its local-build label carries that code's version and commit — so the report belongs beside the fact it describes.

## Decision

[`dsh-api-workspace-git`](../../../../packages/api/workspace-git/README.md) gained a scope-less `upstream()` Remote method. Its subject is the installation, not a Session workspace: every Session shares one running installation, so the method takes no Session identity. The subject is the checkout this module itself sits in, resolved from `import.meta.url` exactly as the Web bundle resolves its own frontend dist, and only when that directory IS the repository top level — a packaged install and a checkout nested inside another repository answer `none` instead of reporting a stranger's remote.

The read is one `git ls-remote <upstreamRemote> refs/heads/<current branch>` compared with HEAD, and it is the only step that reaches the network. A remote commit the local object store already holds yields `behind` with an exact count from `git rev-list --count`; a commit it does not hold proves an update without sizing it, because an object the repository lacks cannot be an ancestor of HEAD. The settled answer is reused for `checkIntervalMs`, and a failed check is not cached, so a client may poll as often as its display needs while the network read stays daily.

[`dsh-client-ui-git-branch`](../../../../packages/client/ui-git-branch/README.md) renders the answer as a badge in the sidebar brand row, extending the package that already carries the checkout chip ([Web composer git-branch chip](2026-09-15-web-composer-git-branch-chip.md)). [`ui-sidebar`](../../../../packages/client/ui-sidebar/README.md) declared `sidebar.brand.status` beside `sidebar.brand.mark` and `sidebar.brand.name`; the occupant is non-interactive, because the brand row is already the New Session button. Its controller polls every 30 minutes while the page is visible and on becoming visible again, and publishes only when the displayed relation — kind, repository slug, count — changes.

## Verification

`tests/upstream.spec.ts` covers the ls-remote and rev-list parsers, `checkUpstream` against real repositories and remotes (current, behind with and without a countable gap, detached HEAD, a removed remote, a branch the remote lacks, a non-repository, an unreachable remote), and the service's interval cache through a scripted subprocess surface: reuse, re-read after expiry, an uncached failure, and one shared in-flight check. `upstream-controller.client.spec.ts` proves the poll publishes a changed relation, stays quiet on an unchanged one, keeps the last answer after a failure or a valueless result, re-reads on the interval, skips a repeat while one read is in flight, and drops a read that settles after disposal. `upstream-badge.client.spec.tsx` proves nothing renders for the quiet relations and that both `behind` labels render their count. `browser-plugin.client.spec.ts` proves all three seat registrations and their HMR removal over the real slot registry. The assembled-client default response table answers `workspaceGit/upstream` so the shell specs still boot. `pnpm run test:gui`, `pnpm run test:docs`, and the regenerated Cordis, config, and client catalogs cover the rest.

## Alternatives considered

- **Scoping the answer to the Session workspace.** Rejected: the brand row is root-scoped and no global active-Session source exists, and the report would follow the Session being read rather than the code being run.
- **A new host package.** Rejected: the fact is another checkout read through the same runner, scope-free Remote plumbing, and client namespace; a second package would duplicate the subprocess wiring for one method.
- **`git fetch` instead of `ls-remote`.** Rejected: a timer that rewrites the checkout's refs and downloads objects is a large side effect for a status light; the named remote branch loses only the exact count until its objects are local.
- **The branch's configured upstream (`@{upstream}`).** Rejected: on a fork that is `origin/master`, so it reports zero behind forever — the fork origin is a different remote.
- **Replacing `sidebar.brand.name`.** Rejected: that seat carries the local-build label, so taking it over would duplicate the version rendering and remove a slot a deployment may replace.
- **The collapsed rail's existing `sidebar.toggle.badge`.** Rejected: the desktop-update badge owns that single seat, and it renders only while the sidebar is collapsed.

## Consequences

- The badge appears only when the installation root is the repository top level, so a packaged install shows nothing.
- The first check after each `checkIntervalMs` reaches the network; a host without one answers `unknown` and retries instead of caching the failure for an interval.
- An upstream repository whose default branch is named differently from the local branch answers `none` rather than compare against the wrong history.
- Nothing model-visible changes: no session event, prompt section, tool schema, or session log entry.
- `ui-sidebar` owns one more declared hole, and its shell snapshot gained the seat's marker.
