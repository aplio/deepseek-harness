/**
 * One installation upstream check: locate the checkout, read its branch and
 * fork-origin remote, then compare the remote branch with HEAD. The remote read
 * is the only network step; every other read is local.
 *
 * @module @deepseek-ai/dsh-api-workspace-git/upstream-check
 */

import { resolve } from 'node:path'
import { githubRepository } from './github.ts'
import type { WorkspaceGitUpstream } from './types.ts'
import { lsRemoteCommit, revListCount } from './upstream.ts'

/**
 * One `git -C <directory> <argv>` invocation, returning trimmed stdout on a
 * zero exit and null on any failure.
 */
export type UpstreamGitRunner = (
  directory: string,
  argv: readonly string[],
  signal: AbortSignal,
) => Promise<string | null>

/** Deployment inputs one installation upstream check reads. */
export interface UpstreamCheckConfig {
  /** Deadline in milliseconds for one `git` invocation. */
  readonly timeoutMs: number
  /**
   * Remote whose branch is the installation's fork origin. A checkout carries
   * it as `origin` when no fork exists, in which case its branch never runs
   * ahead and the answer stays `current`.
   */
  readonly upstreamRemote: string
}

/**
 * Compare the checkout at `root` with the branch its fork-origin remote names.
 * @param runGit - one git invocation against a directory.
 * @param root - the installation's repository root.
 * @param config - the remote name to compare against and the invocation deadline.
 * @returns the settled relation, `none` for a checkout with nothing to compare,
 * or `unknown` when a read failed.
 */
export async function checkUpstream(
  runGit: UpstreamGitRunner,
  root: string,
  config: UpstreamCheckConfig,
): Promise<WorkspaceGitUpstream> {
  // One deadline for the whole check, shared by every invocation in it; the
  // caller has no cancellation to combine with.
  const signal = AbortSignal.timeout(config.timeoutMs)
  const top = await runGit(root, ['rev-parse', '--show-toplevel'], signal)
  // The installation must BE the repository top level: a directory merely
  // inside another checkout would answer with that project's remote.
  if (top === null || resolve(top) !== resolve(root)) return { kind: 'none' }
  // A detached HEAD names no branch to compare, and an unborn branch has no
  // commit of its own yet.
  const branch = await runGit(root, ['branch', '--show-current'], signal)
  if (branch === null || branch === '') return { kind: 'none' }
  const remote = config.upstreamRemote
  const url = await runGit(root, ['config', '--get', `remote.${remote}.url`], signal)
  if (url === null || url === '') return { kind: 'none' }
  const github = githubRepository(url)
  // The remote branch of the same name is the only reference the local branch
  // has a defined relation to; a differently named default branch is `none`
  // rather than a comparison against the wrong history.
  const remoteLine = await runGit(root, ['ls-remote', remote, `refs/heads/${branch}`], signal)
  if (remoteLine === null) return { kind: 'unknown' }
  const remoteCommit = lsRemoteCommit(remoteLine)
  if (remoteCommit === null) return { kind: 'none' }
  const head = await runGit(root, ['rev-parse', 'HEAD'], signal)
  if (head === null || head === '') return { kind: 'none' }
  if (head === remoteCommit) return { kind: 'current', github }
  // A commit the local repository does not hold cannot be an ancestor of HEAD,
  // so its absence proves an update without proving its size.
  const known = await runGit(root, ['cat-file', '-e', `${remoteCommit}^{commit}`], signal)
  if (known === null) return { kind: 'behind', count: null, github }
  const count = revListCount(await runGit(root, ['rev-list', '--count', `HEAD..${remoteCommit}`], signal))
  return count === 0 ? { kind: 'current', github } : { kind: 'behind', count, github }
}
