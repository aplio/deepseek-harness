/** Brand-row badge presentation: what it reports and when it renders nothing. */
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceGitUpstream } from '@deepseek-ai/dsh-api-workspace-git/types'
import { UpstreamBadge, type UpstreamBadgeProps } from '../src/client/UpstreamBadge.tsx'
import { zh } from '../src/client/locales.ts'

const t: UpstreamBadgeProps['t'] = makeTranslate(zh)

afterEach(() => {
  cleanup()
})

/** One badge over a published answer. */
function bench(initial: WorkspaceGitUpstream | undefined): UpstreamBadgeProps {
  const store = createSnapshotStore<WorkspaceGitUpstream | undefined>(initial)
  function useUpstream<R>(select: (state: WorkspaceGitUpstream | undefined) => R): R {
    return select(store.getSnapshot())
  }
  return { useUpstream, t } as unknown as UpstreamBadgeProps
}

describe('UpstreamBadge', () => {
  it('renders nothing until a relation needs reporting', () => {
    const quiet: readonly (WorkspaceGitUpstream | undefined)[] = [
      undefined,
      { kind: 'current', github: null },
      { kind: 'none' },
      { kind: 'unknown' },
    ]
    for (const value of quiet) {
      const { container, unmount } = render(<UpstreamBadge {...bench(value)} />)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })

  it('reports a sized gap as its commit count', () => {
    render(<UpstreamBadge {...bench({ kind: 'behind', count: 3, github: null })} />)
    expect(screen.getByRole('img', { name: '上游有 3 个新提交' }).textContent).toBe('3')
  })

  it('reports an unsized gap without a count', () => {
    render(<UpstreamBadge {...bench({ kind: 'behind', count: null, github: null })} />)
    const badge = screen.getByRole('img', { name: '上游有新提交' })
    expect(badge.textContent).toBe('')
  })
})
