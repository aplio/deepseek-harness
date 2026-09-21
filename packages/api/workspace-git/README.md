---
description: "Workspace git service for the web GUI: the checkout the session workspace directory lives in — ref, worktree directory, and GitHub repository — plus whether the running installation is behind its fork origin, exposed over the workspaceGit Remote namespace."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-workspace-git

English | [中文](README.zh.md)

## Summary

This package answers two host questions for the web GUI: which checkout the current Session workspace lives in, and whether the checkout running dsh is behind the fork origin it came from. The `workspaceGit` Remote namespace resolves a Session header's directory without activating an Agent, runs `git` reads through the subprocess provider, and maps them onto a three-case union — a branch name, a detached HEAD's short commit id, or `none` outside a repository. Found checkouts also carry the worktree directory name and, for a github.com `origin`, its `owner/repo` and URL. Both answers are ambient environment information, never session state.

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

Mount the plugin in a composition that carries `sessions`, `subprocess`, `sandboxPolicy`, and `typert`, normally beside its browser consumer [`dsh-client-ui-git-branch`](../../client/ui-git-branch/README.md). A Client calls `remote.workspaceGit.status(sessionId, signal)` for one Session's checkout and `remote.workspaceGit.upstream()` for the installation it is connected to; the second takes no Session because every Session shares one installation.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `timeoutMs` | required | Deadline in milliseconds for one `git` invocation, from executable resolution through the exit fact. |
| `upstreamRemote` | required | Remote name whose branch is the installation's fork origin. |
| `checkIntervalMs` | required | How long one settled installation upstream answer is reused before the next check. |

### What to expect

One answer names a checked-out branch, including an unborn branch before its first commit; one names the short commit id of a detached HEAD; `none` stands for a directory outside a repository, a host without git, a workspace that is gone, and an invocation that timed out. A directory nested inside a repository reports the containing repository. The worktree directory name is the base name of the checkout's root, so a linked worktree reports the directory the Session actually works in; a repository without a working tree (a bare repository) has none. The GitHub repository is read from `origin` only, and only when that URL addresses github.com, so an unreachable or differently hosted remote leaves it null while the ref answer stands. None of these is an error: an unavailable fact is an answer. Every call spawns `git -C <workspaceRoot> branch --show-current`, then `git rev-parse --show-toplevel` and `git config --get remote.origin.url` — a fourth `git rev-parse --short HEAD` when HEAD is detached, and nothing but the first read outside a repository — with no caching, so a caller that polls owns its interval.

The installation answer is a different subject with different rules. It runs in this package's own repository checkout, not the Session workspace, and only when that checkout is itself the repository top level; a packaged install and a checkout nested inside another repository answer `none`. It compares HEAD with the same-named branch of the configured remote through one `git ls-remote`, which is the only read that reaches the network, and reports `behind` with the commit count when the remote commit is already in the local object store and without a count when it is not — an object the repository does not hold cannot be an ancestor of HEAD, so it proves an update without sizing it. A detached HEAD, an absent remote, and a branch the remote does not carry all answer `none`; an unreachable remote answers `unknown`, which is never cached. Once the relation settles it is reused for `checkIntervalMs`, so a caller may poll as often as its own display needs while the network read stays daily, and concurrent callers share one check.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Session-scoped lookup `workspaceGitScope` resolves a Session id to its workspace directory exactly as `dsh-api-workspace-files` resolves `workspaceFileScope`: the live header's `cwd`, else the persisted header for a cold Session, else the sandbox policy's workspace root; a Session with no header at all resolves to `undefined`, which the Gateway reports as `gateway/lookup-not-found`. Every read combines the caller's signal with the deployment deadline and passes the combined signal to its spawn, so a timeout aborts the managed process range through the subprocess provider's ordinary termination procedure. stdout and stderr are collected under a 64 KiB cap — each answer is one line — and a non-zero exit, an unresolvable `git`, a rejected spawn, and an aborted deadline all read as an unavailable fact. `branch --show-current` carries all three ref cases: a name for a branch or an unborn branch, an empty answer for a detached HEAD that the follow-up short-id read resolves, and a failure outside a repository. The remote URL is parsed in both spellings git stores, scheme URLs (`https://`, `ssh://`, `git://`) and scp-like `[user@]host:path`, and a URL naming anything but `github.com/owner/repo` yields no repository.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the service's own view is not enough; they move from the wire union to its consumer and the seams it builds on.

- [dsh-client-ui-git-branch](../../client/ui-git-branch/README.md) — the composer stats-row chip that polls this namespace.
- [dsh-api-workspace-files](../workspace-files/README.md) — the sibling Session-scoped lookup this service follows.
- [dsh-subprocess](../../subprocess/subprocess/README.md) — the process capability that owns spawn, termination, and output collection.
- [API Gateway](../../../docs/api-gateway.md) — how a generated Remote namespace becomes a Client call.

-----

<a id="model-experience"></a>
## Model Experience

None, as the service reads working-directory facts for browser chrome and never reaches a prompt, a tool schema, or a session event.

#### KV Cache effect

None; the service neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the service answers and what it deliberately does not.

- **No working-tree state** — only the ref, the worktree directory name, and the origin repository are read; dirty, staged, and ahead/behind facts for the Session workspace need a heavier git read that polling cannot afford.
- **Session checkouts are origin-only** — `status` reads `origin` and github.com alone; a remote on another host, a fork's `upstream`, and a remote named otherwise are invisible there. The installation check reads the configured remote name and resolves its URL the same way.
- **No caching for `status`** — every `status` call spawns git, because a cached answer goes stale exactly when a caller polls to learn it changed; a deployment that wants less process churn must poll less. The installation check is the opposite: it caches for `checkIntervalMs` because its read reaches the network.
- **Same-named branch only** — the installation check compares HEAD with the remote branch of the same name. A fork whose default branch is named differently answers `none` rather than compare against the wrong history.
- **No branch list or switch** — the service reads the current ref only.
- **`git` is required on the host** — a host without git answers `none` for every workspace instead of failing loudly; the feature simply never appears.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The service owns no durable or cross-plugin state — the Session answer derives from the Session header and its child processes, the installation answer from a process-local interval cache, and its lookup registration lives and ends inside its own construction.
