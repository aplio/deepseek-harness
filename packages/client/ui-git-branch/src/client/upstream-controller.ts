/**
 * Polling carrier for the installation upstream read: one answer for the whole
 * page, re-read while it is visible. The checkout behind a fork origin moves
 * outside React (a terminal fetch, an upstream push), so the page re-reads on
 * its own; the Host answers from its own daily cache, so most reads are cheap.
 */

import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceGitUpstream } from '@deepseek-ai/dsh-api-workspace-git/types'

/** How often one visible page re-reads the installation upstream answer. */
export const UPSTREAM_POLL_MS = 30 * 60_000

/** The slice of the Client Remote face this controller calls. */
export type WorkspaceGitUpstreamRemote = {
  readonly workspaceGit: Pick<ClientRemote['workspaceGit'], 'upstream'>
}

/**
 * Comparable fields of one answer, so an unchanged poll publishes nothing. The
 * count and repository are what a reader sees; `unknown` and `none` compare as
 * themselves.
 * @param value - one `workspaceGit.upstream` answer.
 * @returns a string that is equal exactly when two answers display the same relation.
 */
export function upstreamFields(value: WorkspaceGitUpstream): string {
  if (value.kind === 'none' || value.kind === 'unknown') return value.kind
  const slug = value.github?.slug ?? ''
  return value.kind === 'current' ? `current:${slug}` : `behind:${slug}:${value.count ?? '?'}`
}

/**
 * Owns the visible-page poll and the published answer. One page has one
 * installation, so the controller watches no identities and holds no shares.
 */
export class UpstreamController {
  /** Latest answer; undefined until the first read settles. */
  readonly upstream: SnapshotStore<WorkspaceGitUpstream | undefined> = createSnapshotStore(undefined)

  private timer: ReturnType<typeof setInterval> | undefined
  private inFlight = false
  private disposed = false

  /** The page became visible again: re-read at once, as a fresh answer may be due. */
  private readonly onVisible = (): void => {
    if (document.visibilityState === 'visible') this.refresh()
  }

  /**
   * @param remote - the Client Remote face carrying the `workspaceGit` namespace.
   */
  constructor(private readonly remote: WorkspaceGitUpstreamRemote) {}

  /** Read once and keep the answer fresh while the page stays visible. */
  start(): void {
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh()
    }, UPSTREAM_POLL_MS)
    document.addEventListener('visibilitychange', this.onVisible)
    this.refresh()
  }

  /** Stop polling and drop any read that settles after disposal. */
  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    document.removeEventListener('visibilitychange', this.onVisible)
  }

  /** One read, at most one in flight; repeats are skipped, not queued. */
  private refresh(): void {
    if (this.inFlight || this.disposed) return
    this.inFlight = true
    void this.remote.workspaceGit.upstream().then(
      (result) => { this.settle(result.ok ? result.value : undefined) },
      () => { this.settle(undefined) },
    )
  }

  /**
   * Publish one settled read. A failure keeps the last known answer; a read
   * that settles after disposal publishes nothing.
   * @param value - the answer, or undefined when the call failed.
   */
  private settle(value: WorkspaceGitUpstream | undefined): void {
    this.inFlight = false
    if (this.disposed || value === undefined) return
    const previous = this.upstream.getSnapshot()
    if (previous !== undefined && upstreamFields(previous) === upstreamFields(value)) return
    this.upstream.set(value)
  }
}
