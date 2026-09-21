/**
 * Brand-row poll: what it publishes, when it stays quiet or keeps the last
 * answer, and its teardown.
 */
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceGitUpstream } from '@deepseek-ai/dsh-api-workspace-git/types'
import {
  UPSTREAM_POLL_MS, UpstreamController, upstreamFields, type WorkspaceGitUpstreamRemote,
} from '../src/client/upstream-controller.ts'

const GITHUB = { slug: 'deepseek-ai/deepseek-harness', url: 'https://github.com/deepseek-ai/deepseek-harness' }
const BEHIND: WorkspaceGitUpstream = { kind: 'behind', count: 2, github: GITHUB }

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** One controller over a scripted Remote method. */
function bench(upstream: ReturnType<typeof vi.fn>): UpstreamController {
  const remote = { workspaceGit: { upstream } } as unknown as WorkspaceGitUpstreamRemote
  return new UpstreamController(remote)
}

/** One successful answer. */
const ok = (value: WorkspaceGitUpstream): { ok: true; value: WorkspaceGitUpstream } => ({ ok: true, value })

describe('upstreamFields', () => {
  it('compares the displayed relation field by field', () => {
    expect(upstreamFields({ kind: 'none' })).toBe('none')
    expect(upstreamFields({ kind: 'unknown' })).toBe('unknown')
    expect(upstreamFields({ kind: 'current', github: GITHUB })).toBe('current:deepseek-ai/deepseek-harness')
    expect(upstreamFields({ kind: 'current', github: null })).toBe('current:')
    expect(upstreamFields({ kind: 'behind', count: 2, github: GITHUB })).toBe('behind:deepseek-ai/deepseek-harness:2')
    expect(upstreamFields({ kind: 'behind', count: null, github: null })).toBe('behind::?')
    expect(upstreamFields(BEHIND)).not.toBe(upstreamFields({ kind: 'behind', count: 3, github: GITHUB }))
  })
})

describe('UpstreamController', () => {
  it('reads once at startup and republishes only a changed relation', async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(ok(BEHIND))
      .mockResolvedValueOnce(ok(BEHIND))
      .mockResolvedValueOnce(ok({ kind: 'current', github: GITHUB }))
    const controller = bench(upstream)
    controller.start()
    await vi.waitFor(() => { expect(controller.upstream.getSnapshot()).toEqual(BEHIND) })

    // An unchanged answer keeps the published reference, so nothing re-renders.
    const published = controller.upstream.getSnapshot()
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(upstream).toHaveBeenCalledTimes(2) })
    expect(controller.upstream.getSnapshot()).toBe(published)

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(controller.upstream.getSnapshot()).toEqual({ kind: 'current', github: GITHUB }) })
    controller.dispose()
  })

  it('keeps the last answer when a read fails or reports no value', async () => {
    const upstream = vi.fn()
      .mockResolvedValueOnce(ok(BEHIND))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: false })
    const controller = bench(upstream)
    controller.start()
    await vi.waitFor(() => { expect(controller.upstream.getSnapshot()).toEqual(BEHIND) })

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(upstream).toHaveBeenCalledTimes(2) })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => { expect(upstream).toHaveBeenCalledTimes(3) })
    expect(controller.upstream.getSnapshot()).toEqual(BEHIND)
    controller.dispose()
  })

  it('re-reads on the visible interval and stops at disposal', async () => {
    vi.useFakeTimers()
    const upstream = vi.fn(async () => ok({ kind: 'current' as const, github: null }))
    const controller = bench(upstream)
    controller.start()
    expect(upstream).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(UPSTREAM_POLL_MS)
    expect(upstream).toHaveBeenCalledTimes(2)
    controller.dispose()
    await vi.advanceTimersByTimeAsync(UPSTREAM_POLL_MS * 2)
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('skips a poll while one read is in flight and drops one that settles after disposal', async () => {
    let settle: ((value: unknown) => void) | undefined
    const upstream = vi.fn(() => new Promise((resolve) => { settle = resolve }))
    const controller = bench(upstream)
    controller.start()

    // A second refresh while the first is pending is skipped, not queued.
    document.dispatchEvent(new Event('visibilitychange'))
    expect(upstream).toHaveBeenCalledTimes(1)

    controller.dispose()
    settle?.(ok(BEHIND))
    await Promise.resolve()
    await Promise.resolve()
    expect(controller.upstream.getSnapshot()).toBeUndefined()
  })
})
