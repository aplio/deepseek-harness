/**
 * Git-branch chip plugin, browser half: the lead occupant of the composer's
 * session-stats row and of the question card's header, showing the checkout
 * the current Session workspace lives in, plus the sidebar brand-row badge
 * reporting whether the checkout serving this process is behind its fork
 * origin. The Host answers both through the `workspaceGit` Remote namespace;
 * this plugin owns the polling caches and the presentations.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { GitBranchController } from './controller.ts'
import { GitBranchChip, type GitBranchChipInjected } from './GitBranchChip.tsx'
import { UpstreamBadge, type UpstreamBadgeInjected } from './UpstreamBadge.tsx'
import { UpstreamController } from './upstream-controller.ts'
import { en, NS, zh, type GitBranchKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Composer stats-row git-branch copy. */
    'gitBranch': GitBranchKey
  }
}

export type { GitBranchChipInjected, GitBranchChipProps } from './GitBranchChip.tsx'
export type { UpstreamBadgeInjected, UpstreamBadgeProps } from './UpstreamBadge.tsx'

/** Required services for the Remote face, the seat contributions, and copy registration. */
export const inject = ['slots', 'locale', 'remote', 'remote.workspaceGit']

/**
 * Client plugin body: register the dictionaries, both checkout controllers,
 * and the three seats — the chip's two lead seats and the sidebar brand row's
 * update notice.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new GitBranchController(ctx.remote)
  ctx.effect(() => () => { controller.dispose() }, 'ui-git-branch: checkout polling')
  const upstream = new UpstreamController(ctx.remote)
  ctx.effect(() => () => { upstream.dispose() }, 'ui-git-branch: installation upstream polling')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-git-branch: dictionaries')
  const chipInjected = (): GitBranchChipInjected => ({
    hooks: { gitBranch: controller.branches },
    acquire: (sessionId) => { controller.acquire(sessionId) },
    release: (sessionId) => { controller.release(sessionId) },
  })
  // ui-chat's stats row renders this seat ahead of its figures, so the chip
  // reads with the stats it shares the line with.
  ctx.slots.inject('conversation.composer.stats.lead', () => ctx.slots.register({
    name: 'conversation.composer.stats.lead',
    id: 'git-branch',
    order: 0,
    locale: NS,
    inject: chipInjected,
  }, GitBranchChip))
  // The question takeover hides the composer bar, so ui-user-questions'
  // card header carries its own lead seat and the checkout stays visible
  // while the user answers. Both chips share one watch per Session.
  ctx.slots.inject('conversation.question.header.lead', () => ctx.slots.register({
    name: 'conversation.question.header.lead',
    id: 'git-branch',
    order: 0,
    locale: NS,
    inject: chipInjected,
  }, GitBranchChip))
  // The installation answer is one fact per page, so it polls once at startup
  // rather than per Session; the badge sits beside the local-build label the
  // brand row already carries for the same code.
  upstream.start()
  ctx.slots.inject('sidebar.brand.status', () => ctx.slots.register({
    name: 'sidebar.brand.status',
    locale: NS,
    inject: (): UpstreamBadgeInjected => ({ hooks: { upstream: upstream.upstream } }),
  }, UpstreamBadge))
}
