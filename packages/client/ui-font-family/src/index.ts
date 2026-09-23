/** Host registration for the durable font-family preference and its pre-plugin application. */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { bootFontInjection } from './boot-font.ts'
import { FONT_FAMILY_FIELD, FontSettingsFields, type FontSettings } from './font-settings.ts'

export type { FontSettings } from './font-settings.ts'

/** Runtime preference projected to the browser. */
export interface Config {
  /** CSS font-family list applied to UI text and code; absent keeps the shipped stacks. */
  fontFamily: Volatile<FontSettings['fontFamily']>
}

/** Live font preference. */
export const Config = z.object({
  [FONT_FAMILY_FIELD]: FontSettingsFields[FONT_FAMILY_FIELD].volatile(),
})

/**
 * Register the settings page policy when the optional settings service is
 * composed, and answer every index injection collection with the font
 * bootstrap row while a family is stored.
 * @param ctx - Host context that may acquire the settings service.
 * @param config - Validated live font preference.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
  ctx.on('webserver/index-inject', (table) => {
    const row = bootFontInjection(config.fontFamily.get())
    if (row !== undefined) table.push(row)
  })
}
