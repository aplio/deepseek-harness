/**
 * `git ls-remote` and `git rev-list` answer parsing for the installation
 * upstream check.
 *
 * @module @deepseek-ai/dsh-api-workspace-git/upstream
 */

/** A 40-hex commit id: the only first field `ls-remote` prints for a branch ref. */
const COMMIT = /^[0-9a-f]{40}$/u

/**
 * Read the commit id from one `git ls-remote <remote> refs/heads/<branch>` answer.
 * @param stdout - command output, or null when the invocation failed.
 * @returns the commit id, or null when the remote has no such branch or the answer is unusable.
 */
export function lsRemoteCommit(stdout: string | null): string | null {
  if (stdout === null) return null
  const [line = ''] = stdout.split('\n')
  const [commit = ''] = line.trim().split(/\s+/u)
  return COMMIT.test(commit) ? commit : null
}

/**
 * Read a `git rev-list --count` answer.
 * @param stdout - command output, or null when the invocation failed.
 * @returns the count, or null when the answer is missing or is not a non-negative integer.
 */
export function revListCount(stdout: string | null): number | null {
  if (stdout === null || stdout === '') return null
  const count = Number(stdout)
  return Number.isSafeInteger(count) && count >= 0 ? count : null
}
