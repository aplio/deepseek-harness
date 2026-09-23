/** Host half: durable preference validation and the pre-plugin index boot rows. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import * as HostPlugin from '../src/index.ts'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig } from '../../../settings/settings/src/schema.ts'
import { Config, apply } from '@deepseek-ai/dsh-client-ui-font-family'

/** Collect the injection table the way an index render or boot payload does. */
function collect(ctx: Context): IndexInjection[] {
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table)
  return table
}

/** Narrow the font row and return its script body. */
function scriptText(row: IndexInjection | undefined): string {
  if (row?.kind !== 'script') throw new Error('expected a script row')
  return row.text
}

describe('ui-font-family host', () => {
  it('registers, validates, and disposes the durable font preference with its fiber', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    const { fiber } = configuration
    expect(plainConfig(configuration.fiber.config)).toEqual({})
    await configuration.update({ fontFamily: '"Hiragino Sans", sans-serif' })
    expect(plainConfig(configuration.fiber.config)).toEqual({ fontFamily: '"Hiragino Sans", sans-serif' })
    await expect(configuration.update({ fontFamily: 'broken ; value' })).rejects.toThrow()
    await expect(configuration.update({ fontFamily: 'x'.repeat(257) })).rejects.toThrow()
    await fiber.dispose()
  })

  it('bootstraps only the durable family and drops the row when the field is cleared', async () => {
    const ctx = new Context()
    const configuration = await liveConfig(ctx, { Config, apply })
    const { fiber } = configuration
    // No stored family: the shipped theme stacks stay untouched.
    expect(collect(ctx)).toEqual([])
    await configuration.update({ fontFamily: '"Hiragino Sans", sans-serif' })
    const rows = collect(ctx)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'script', placement: 'body' })
    expect(scriptText(rows[0])).toContain(JSON.stringify('"Hiragino Sans", sans-serif'))
    expect(scriptText(rows[0])).toContain('--dsw-font-family')
    expect(scriptText(rows[0])).toContain('--ds-font-family-code')
    // Clearing the field drops the row, so the shipped stacks return.
    await configuration.update({ fontFamily: undefined })
    expect(collect(ctx)).toEqual([])
    await fiber.dispose()
    expect(collect(ctx)).toEqual([])
  })

  it('contributes no row without a stored family', async () => {
    const ctx = new Context()
    await ctx.plugin({ Config, apply }).await()
    expect(collect(ctx)).toEqual([])
  })
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin(HostPlugin)))
