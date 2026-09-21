/**
 * Installation upstream reads: the answer parsers, the check against real
 * repositories and remotes, and the service's interval cache over a scripted
 * subprocess surface.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkUpstream, type UpstreamGitRunner } from '../src/upstream-check.ts'
import { lsRemoteCommit, revListCount } from '../src/upstream.ts'
import { handleOf, OK, scripted, serviceWith } from './scripted.ts'

const git = promisify(execFile)

/** Repository root of this checkout: the directory the service checks by default. */
const INSTALLATION_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** Git invocations the installation check makes, keyed by their arguments after `-C <root>`. */
const TOPLEVEL = 'rev-parse --show-toplevel'
const BRANCH = 'branch --show-current'
const REMOTE_URL = 'config --get remote.upstream.url'
const LS_REMOTE = 'ls-remote upstream refs/heads/master'
const HEAD = 'rev-parse HEAD'

const LOCAL_COMMIT = 'a'.repeat(40)
const REMOTE_COMMIT = 'b'.repeat(40)

/** Real-git runner: the same trimmed-stdout-or-null mapping the service's runner applies. */
const runner: UpstreamGitRunner = async (directory, argv) => {
  try {
    const { stdout } = await git('git', ['-C', directory, ...argv])
    return stdout.trim()
  } catch {
    // Swallows git's non-zero exit: a failed read is the check's null answer.
    return null
  }
}

/** Deployment inputs one check runs under. */
const CONFIG = { timeoutMs: 10_000, upstreamRemote: 'upstream' }

/** Temp roots to remove after each test. */
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

/** A bare repository with one commit, a work clone of it, and a way to advance the bare side. */
interface UpstreamFixture {
  /** The clone whose `upstream` remote is the bare repository. */
  readonly local: string
  /** Push one more commit to the bare repository without fetching it locally. */
  advance(): Promise<void>
}

/** Build a bare repository with one commit and a clone whose only remote is `upstream`. */
async function openFixture(): Promise<UpstreamFixture> {
  const root = await mkdtemp(join(tmpdir(), 'workspace-git-upstream-'))
  roots.push(root)
  const seed = join(root, 'seed')
  const bare = join(root, 'upstream.git')
  const local = join(root, 'local')
  await git('git', ['init', '--initial-branch=master', seed])
  await git('git', ['-C', seed, 'config', 'user.email', 'test@example.com'])
  await git('git', ['-C', seed, 'config', 'user.name', 'Test'])
  await git('git', ['-C', seed, 'commit', '--allow-empty', '-m', 'one'])
  await git('git', ['init', '--bare', '--initial-branch=master', bare])
  await git('git', ['-C', seed, 'remote', 'add', 'upstream', bare])
  await git('git', ['-C', seed, 'push', 'upstream', 'master'])
  await git('git', ['clone', bare, local])
  await git('git', ['-C', local, 'config', 'user.email', 'test@example.com'])
  await git('git', ['-C', local, 'config', 'user.name', 'Test'])
  await git('git', ['-C', local, 'remote', 'rename', 'origin', 'upstream'])
  return {
    local,
    advance: async () => {
      await git('git', ['-C', seed, 'commit', '--allow-empty', '-m', 'two'])
      await git('git', ['-C', seed, 'push', 'upstream', 'master'])
    },
  }
}

describe('upstream answer parsers', () => {
  it('reads the commit id of the first ls-remote line', () => {
    expect(lsRemoteCommit(`${LOCAL_COMMIT}\trefs/heads/master\n`)).toBe(LOCAL_COMMIT)
    expect(lsRemoteCommit(`${LOCAL_COMMIT} refs/heads/master`)).toBe(LOCAL_COMMIT)
  })

  it('rejects a missing, empty, or malformed ls-remote answer', () => {
    expect(lsRemoteCommit(null)).toBeNull()
    expect(lsRemoteCommit('')).toBeNull()
    expect(lsRemoteCommit('not-a-commit\trefs/heads/master')).toBeNull()
    expect(lsRemoteCommit(`${LOCAL_COMMIT.slice(0, 39)}\trefs/heads/master`)).toBeNull()
  })

  it('reads a non-negative rev-list count and rejects anything else', () => {
    expect(revListCount('0')).toBe(0)
    expect(revListCount('12')).toBe(12)
    expect(revListCount(null)).toBeNull()
    expect(revListCount('')).toBeNull()
    expect(revListCount('1.5')).toBeNull()
    expect(revListCount('many')).toBeNull()
  })
})

describe('checkUpstream over real repositories', () => {
  it('answers current when the remote branch is the checkout HEAD', async () => {
    const fixture = await openFixture()
    await expect(checkUpstream(runner, fixture.local, CONFIG)).resolves.toEqual({ kind: 'current', github: null })
  })

  it('answers behind with an unknown count until the remote objects are local, then sizes the gap', async () => {
    const fixture = await openFixture()
    await fixture.advance()
    await expect(checkUpstream(runner, fixture.local, CONFIG)).resolves.toEqual({
      kind: 'behind', count: null, github: null,
    })
    // Fetching the new commit without moving HEAD makes the exact count knowable.
    await git('git', ['-C', fixture.local, 'fetch', 'upstream'])
    await expect(checkUpstream(runner, fixture.local, CONFIG)).resolves.toEqual({
      kind: 'behind', count: 1, github: null,
    })
  })

  it('answers none for a detached HEAD, a missing remote, and a branch the remote does not carry', async () => {
    const detached = await openFixture()
    await git('git', ['-C', detached.local, 'checkout', '--detach'])
    await expect(checkUpstream(runner, detached.local, CONFIG)).resolves.toEqual({ kind: 'none' })

    const remotes = await openFixture()
    await git('git', ['-C', remotes.local, 'remote', 'remove', 'upstream'])
    await expect(checkUpstream(runner, remotes.local, CONFIG)).resolves.toEqual({ kind: 'none' })

    const renamed = await openFixture()
    await git('git', ['-C', renamed.local, 'branch', '-m', 'topic'])
    await expect(checkUpstream(runner, renamed.local, CONFIG)).resolves.toEqual({ kind: 'none' })
  })

  it('answers none outside a repository and unknown when the remote is unreachable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workspace-git-plain-'))
    roots.push(root)
    await expect(checkUpstream(runner, root, CONFIG)).resolves.toEqual({ kind: 'none' })

    const fixture = await openFixture()
    await git('git', ['-C', fixture.local, 'remote', 'set-url', 'upstream', join(root, 'absent.git')])
    await expect(checkUpstream(runner, fixture.local, CONFIG)).resolves.toEqual({ kind: 'unknown' })
  })
})

describe('WorkspaceGit.upstream over a scripted subprocess', () => {
  /** The answers one current relation needs, with the remote commit equal to HEAD. */
  const currentAnswers = (): Record<string, ReturnType<typeof handleOf>> => ({
    [TOPLEVEL]: handleOf(Promise.resolve(OK), `${INSTALLATION_ROOT}\n`),
    [BRANCH]: handleOf(Promise.resolve(OK), 'master\n'),
    [REMOTE_URL]: handleOf(Promise.resolve(OK), 'git@github.com:deepseek-ai/deepseek-harness.git\n'),
    [LS_REMOTE]: handleOf(Promise.resolve(OK), `${LOCAL_COMMIT}\trefs/heads/master\n`),
    [HEAD]: handleOf(Promise.resolve(OK), `${LOCAL_COMMIT}\n`),
  })

  const GITHUB = { slug: 'deepseek-ai/deepseek-harness', url: 'https://github.com/deepseek-ai/deepseek-harness' }

  it('reads one relation and reuses it until the interval expires', async () => {
    const spawn = vi.fn(scripted(currentAnswers()))
    const service = serviceWith(spawn)
    await expect(service.upstream()).resolves.toEqual({ kind: 'current', github: GITHUB })
    await expect(service.upstream()).resolves.toEqual({ kind: 'current', github: GITHUB })
    expect(spawn).toHaveBeenCalledTimes(5)

    // An expired interval re-reads; a zero interval is the shortest expiry.
    const expiring = vi.fn(scripted(currentAnswers()))
    const rechecking = serviceWith(expiring, 5_000, undefined, 0)
    await rechecking.upstream()
    await rechecking.upstream()
    expect(expiring).toHaveBeenCalledTimes(10)
  })

  it('sizes a gap the local repository can measure and reports one it cannot', async () => {
    const counted = vi.fn(scripted({
      ...currentAnswers(),
      [LS_REMOTE]: handleOf(Promise.resolve(OK), `${REMOTE_COMMIT}\trefs/heads/master\n`),
      [HEAD]: handleOf(Promise.resolve(OK), `${LOCAL_COMMIT}\n`),
      [`cat-file -e ${REMOTE_COMMIT}^{commit}`]: handleOf(Promise.resolve(OK), ''),
      [`rev-list --count HEAD..${REMOTE_COMMIT}`]: handleOf(Promise.resolve(OK), '3\n'),
    }))
    await expect(serviceWith(counted).upstream()).resolves.toEqual({ kind: 'behind', count: 3, github: GITHUB })

    const unsized = vi.fn(scripted({
      ...currentAnswers(),
      [LS_REMOTE]: handleOf(Promise.resolve(OK), `${REMOTE_COMMIT}\trefs/heads/master\n`),
      [HEAD]: handleOf(Promise.resolve(OK), `${LOCAL_COMMIT}\n`),
      [`cat-file -e ${REMOTE_COMMIT}^{commit}`]: handleOf(Promise.resolve({ exitCode: 1, signal: null }), ''),
    }))
    await expect(serviceWith(unsized).upstream()).resolves.toEqual({ kind: 'behind', count: null, github: GITHUB })
  })

  it('answers none when HEAD already contains the remote commit but the count reads zero', async () => {
    const zero = vi.fn(scripted({
      ...currentAnswers(),
      [LS_REMOTE]: handleOf(Promise.resolve(OK), `${REMOTE_COMMIT}\trefs/heads/master\n`),
      [HEAD]: handleOf(Promise.resolve(OK), `${LOCAL_COMMIT}\n`),
      [`cat-file -e ${REMOTE_COMMIT}^{commit}`]: handleOf(Promise.resolve(OK), ''),
      [`rev-list --count HEAD..${REMOTE_COMMIT}`]: handleOf(Promise.resolve(OK), '0\n'),
    }))
    await expect(serviceWith(zero).upstream()).resolves.toEqual({ kind: 'current', github: GITHUB })
  })

  it('answers none when the installation is not the repository top level, has no branch, or has no remote', async () => {
    const elsewhere = vi.fn(scripted({
      [TOPLEVEL]: handleOf(Promise.resolve(OK), '/somewhere/else\n'),
    }))
    await expect(serviceWith(elsewhere).upstream()).resolves.toEqual({ kind: 'none' })

    const absent = vi.fn(scripted({
      [TOPLEVEL]: handleOf(Promise.resolve({ exitCode: 128, signal: null }), ''),
    }))
    await expect(serviceWith(absent).upstream()).resolves.toEqual({ kind: 'none' })

    const detached = vi.fn(scripted({
      [TOPLEVEL]: handleOf(Promise.resolve(OK), `${INSTALLATION_ROOT}\n`),
      [BRANCH]: handleOf(Promise.resolve(OK), '\n'),
    }))
    await expect(serviceWith(detached).upstream()).resolves.toEqual({ kind: 'none' })

    const unconfigured = vi.fn(scripted({
      [TOPLEVEL]: handleOf(Promise.resolve(OK), `${INSTALLATION_ROOT}\n`),
      [BRANCH]: handleOf(Promise.resolve(OK), 'master\n'),
      [REMOTE_URL]: handleOf(Promise.resolve({ exitCode: 1, signal: null }), ''),
    }))
    await expect(serviceWith(unconfigured).upstream()).resolves.toEqual({ kind: 'none' })
  })

  it('answers none when the remote carries no branch of that name, and none without a HEAD', async () => {
    const absentBranch = vi.fn(scripted({
      [TOPLEVEL]: handleOf(Promise.resolve(OK), `${INSTALLATION_ROOT}\n`),
      [BRANCH]: handleOf(Promise.resolve(OK), 'master\n'),
      [REMOTE_URL]: handleOf(Promise.resolve(OK), 'https://github.com/deepseek-ai/deepseek-harness\n'),
      [LS_REMOTE]: handleOf(Promise.resolve(OK), ''),
    }))
    await expect(serviceWith(absentBranch).upstream()).resolves.toEqual({ kind: 'none' })

    const headless = vi.fn(scripted({
      ...currentAnswers(),
      [LS_REMOTE]: handleOf(Promise.resolve(OK), `${REMOTE_COMMIT}\trefs/heads/master\n`),
      [HEAD]: handleOf(Promise.resolve(OK), ''),
    }))
    await expect(serviceWith(headless).upstream()).resolves.toEqual({ kind: 'none' })
  })

  it('retries an unreachable remote on the next call instead of caching the failure', async () => {
    const spawn = vi.fn(scripted({
      [TOPLEVEL]: handleOf(Promise.resolve(OK), `${INSTALLATION_ROOT}\n`),
      [BRANCH]: handleOf(Promise.resolve(OK), 'master\n'),
      [REMOTE_URL]: handleOf(Promise.resolve(OK), 'https://github.com/deepseek-ai/deepseek-harness\n'),
      [LS_REMOTE]: handleOf(Promise.reject(new Error('offline')), ''),
    }))
    const service = serviceWith(spawn)
    await expect(service.upstream()).resolves.toEqual({ kind: 'unknown' })
    await expect(service.upstream()).resolves.toEqual({ kind: 'unknown' })
    expect(spawn).toHaveBeenCalledTimes(8)
  })

  it('shares one in-flight check between concurrent callers', async () => {
    const spawn = vi.fn(scripted(currentAnswers()))
    const service = serviceWith(spawn)
    const [first, second] = await Promise.all([service.upstream(), service.upstream()])
    expect(first).toEqual({ kind: 'current', github: GITHUB })
    expect(second).toEqual(first)
    expect(spawn).toHaveBeenCalledTimes(5)
  })
})
