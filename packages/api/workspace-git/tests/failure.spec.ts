/** Failure and answer mapping, driven by a scripted subprocess surface. */

import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceGitScope } from '../src/index.ts'
import { handleOf, OK, scripted, serviceWith, signal } from './scripted.ts'

/** One workspace identity for direct service calls. */
const SCOPE: WorkspaceGitScope = { sessionId: SessionId('s-test'), workspaceRoot: '/workspace' }

/** The git invocations one read can make, keyed by their arguments after `-C <workspaceRoot>`. */
const REF = 'branch --show-current'
const HEAD = 'rev-parse --short HEAD'
const TOPLEVEL = 'rev-parse --show-toplevel'
const ORIGIN = 'config --get remote.origin.url'

describe('WorkspaceGit.status over a scripted subprocess', () => {
  it('runs git against the workspace directory and folds its three answers', async () => {
    const spawn = vi.fn(scripted({
      [REF]: handleOf(Promise.resolve(OK), 'feature/x\n'),
      [TOPLEVEL]: handleOf(Promise.resolve(OK), '/srv/git/moqt-js-feature\n'),
      [ORIGIN]: handleOf(Promise.resolve(OK), 'git@github.com:shiguredo/moqt-js.git\n'),
    }))
    await expect(serviceWith(spawn).status(SCOPE, signal())).resolves.toEqual({
      kind: 'branch',
      name: 'feature/x',
      worktree: 'moqt-js-feature',
      github: { slug: 'shiguredo/moqt-js', url: 'https://github.com/shiguredo/moqt-js' },
    })
    expect(spawn.mock.calls[0]?.[0]).toMatchObject({
      argv: ['git', '-C', '/workspace', 'branch', '--show-current'],
      cwd: '/workspace',
      stdio: { stdin: 'ignore', stdout: { maxBytes: 64 * 1024 }, stderr: { maxBytes: 64 * 1024 } },
      graceMs: 5_000,
    })
    expect(spawn.mock.calls.map(([spec]) => spec.argv.slice(3).join(' ')))
      .toEqual([REF, TOPLEVEL, ORIGIN])
  })

  it('keeps the ref when the worktree and remote reads fail', async () => {
    const spawn = vi.fn(scripted({
      [REF]: handleOf(Promise.resolve(OK), 'topic\n'),
      [TOPLEVEL]: handleOf(Promise.resolve({ exitCode: 128, signal: null }), ''),
      [ORIGIN]: handleOf(Promise.resolve({ exitCode: 1, signal: null }), ''),
    }))
    await expect(serviceWith(spawn).status(SCOPE, signal())).resolves.toEqual({
      kind: 'branch',
      name: 'topic',
      worktree: null,
      github: null,
    })
    expect(spawn).toHaveBeenCalledTimes(3)
  })

  it('answers none when the host has no git and never spawns', async () => {
    const spawn = vi.fn(scripted({ [REF]: handleOf(Promise.resolve(OK), 'topic\n') }))
    const service = serviceWith(spawn, 5_000, async () => { throw new Error('not found') })
    await expect(service.status(SCOPE, signal())).resolves.toEqual({ kind: 'none' })
    expect(spawn).not.toHaveBeenCalled()
  })

  it('answers none on a non-zero exit, a spawn failure, and missing stdout', async () => {
    const failed = serviceWith(scripted({ [REF]: handleOf(Promise.resolve({ exitCode: 128, signal: null }), '') }))
    await expect(failed.status(SCOPE, signal())).resolves.toEqual({ kind: 'none' })

    const rejected = serviceWith(scripted({ [REF]: handleOf(Promise.reject(new Error('spawn failed')), '') }))
    await expect(rejected.status(SCOPE, signal())).resolves.toEqual({ kind: 'none' })

    const uncollected = serviceWith(scripted({ [REF]: { ...handleOf(Promise.resolve(OK), ''), collected: {} } }))
    await expect(uncollected.status(SCOPE, signal())).resolves.toEqual({ kind: 'none' })
  })

  it('maps a detached HEAD to the short commit id and gives up without one', async () => {
    const spawn = vi.fn(scripted({
      [REF]: handleOf(Promise.resolve(OK), ''),
      [TOPLEVEL]: handleOf(Promise.resolve(OK), '/srv/git/moqt-js\n'),
      [ORIGIN]: handleOf(Promise.resolve(OK), ''),
      [HEAD]: handleOf(Promise.resolve(OK), 'abc1234\n'),
    }))
    await expect(serviceWith(spawn).status(SCOPE, signal())).resolves.toEqual({
      kind: 'detached',
      head: 'abc1234',
      worktree: 'moqt-js',
      github: null,
    })
    expect(spawn.mock.calls.map(([spec]) => spec.argv.slice(3).join(' '))).toEqual([REF, TOPLEVEL, ORIGIN, HEAD])

    const headless = serviceWith(scripted({
      [REF]: handleOf(Promise.resolve(OK), ''),
      [TOPLEVEL]: handleOf(Promise.resolve(OK), ''),
      [ORIGIN]: handleOf(Promise.resolve(OK), ''),
      [HEAD]: handleOf(Promise.resolve(OK), ''),
    }))
    await expect(headless.status(SCOPE, signal())).resolves.toEqual({ kind: 'none' })
  })

  it('answers none when the deadline aborts the git process', async () => {
    const spawn = vi.fn((spec: SubprocessSpawnSpec) => handleOf(
      new Promise<SubprocessOutcome>((_resolve, reject) => {
        spec.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
      }),
      '',
    ))
    const service = serviceWith(spawn, 20)
    await expect(service.status(SCOPE, signal())).resolves.toEqual({ kind: 'none' })
    expect(spawn.mock.calls[0]?.[0].signal?.aborted).toBe(true)
  })
})
