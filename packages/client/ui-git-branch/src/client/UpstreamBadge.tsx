/**
 * Sidebar brand-row badge: the checkout serving this process is behind the fork
 * origin its `upstream` remote names. The Host owns the daily check; this
 * plugin owns only the page poll and the presentation.
 */

import { IconDownloadOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceGitUpstream } from '@deepseek-ai/dsh-api-workspace-git/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: loads the 'sidebar.brand.status' declaration from ui-sidebar.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { NS } from './locales.ts'
import css from './UpstreamBadge.module.css'

/** Hooks injected into the sidebar brand-row upstream badge. */
export interface UpstreamBadgeInjected {
  hooks: {
    upstream: ObservableSnapshot<WorkspaceGitUpstream | undefined>
  }
}

/** Full props of the sidebar brand-row upstream badge. */
export type UpstreamBadgeProps =
  PropsRuntime<'sidebar.brand.status'>
  & PropsLocale<typeof NS>
  & InjectFace<UpstreamBadgeInjected>

/**
 * Report that the checkout serving this process is behind the fork origin its
 * `upstream` remote names, as a download glyph followed by the commit count
 * when the Host could size the gap. Nothing renders while the relation is
 * `current`, `none`, `unknown`, or not yet read — the badge never reports a guess.
 * @param props - Injected upstream state and localized copy.
 * @returns the badge, or null when this checkout has no update to report.
 */
export function UpstreamBadge({ useUpstream, t }: UpstreamBadgeProps) {
  const upstream = useUpstream(value => value)
  if (upstream === undefined || upstream.kind !== 'behind') return null
  const label = upstream.count === null
    ? t('upstream.behind.unknown')
    : t('upstream.behind', { count: upstream.count })
  return (
    <Tooltip label={label} side="right" delayMs={500}>
      <span className={css.badge} role="img" aria-label={label}>
        <IconDownloadOutline16 />
        {upstream.count === null ? null : <span className={css.count}>{upstream.count}</span>}
      </span>
    </Tooltip>
  )
}
