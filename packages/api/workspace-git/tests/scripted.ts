/**
 * Scripted subprocess surface for the workspace-git specs: one hand-built
 * `SubprocessHandle` per git invocation, so answer and failure mapping run
 * without a real repository, a real git binary, or any network.
 */
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessOutcome, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { WorkspaceGit } from '../src/index.ts'

/** A caller cancellation no test aborts. */
export const signal = (): AbortSignal => new AbortController().signal

/** A zero exit with no signal. */
export const OK: SubprocessOutcome = { exitCode: 0, signal: null }

/** A handle whose stdout comes back verbatim and whose outcome is the given one. */
export function handleOf(done: Promise<SubprocessOutcome>, stdout: string): SubprocessHandle {
  return {
    stdin: undefined,
    stdout: undefined,
    stderr: undefined,
    control: undefined,
    collected: {
      stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) },
    },
    done,
    terminate: () => {},
    waitForExit: async () => true,
  }
}

/** One scripted answer: a fixed handle, or a thunk for invocations that must count. */
export type ScriptedAnswer = SubprocessHandle | (() => SubprocessHandle)

/** Answer git invocations by their arguments after `-C <directory>`; an unscripted invocation fails the test. */
export function scripted(answers: Record<string, ScriptedAnswer>): (spec: SubprocessSpawnSpec) => SubprocessHandle {
  return (spec) => {
    const key = spec.argv.slice(3).join(' ')
    const answer = answers[key]
    if (answer === undefined) throw new Error(`unscripted git invocation "${key}"`)
    return typeof answer === 'function' ? answer() : answer
  }
}

/**
 * Build the service over a scripted subprocess surface.
 * @param spawn - the scripted spawn function.
 * @param timeoutMs - deployment git deadline.
 * @param resolve - executable resolution, rejecting to model a host with no git.
 * @param checkIntervalMs - how long one installation upstream answer is reused.
 * @returns the service under test.
 */
export function serviceWith(
  spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle,
  timeoutMs = 5_000,
  resolve: () => Promise<string> = async () => 'git',
  checkIntervalMs = 86_400_000,
): WorkspaceGit {
  const ctx = new Context()
  ctx.provide('sandboxPolicy', { workspaceRoot: '/workspace' } as never)
  ctx.provide('subprocess', { resolveExecutable: resolve, spawn } as never)
  return new WorkspaceGit(ctx, { timeoutMs, upstreamRemote: 'upstream', checkIntervalMs })
}
