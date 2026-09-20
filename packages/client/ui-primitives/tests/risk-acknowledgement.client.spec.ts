// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { acknowledgeRisk, isRiskAcknowledged } from '../src/risk-acknowledgement.ts'

const KEY = 'example-risk'
const STORAGE_KEY = `dsh.risk-acknowledged.${KEY}`

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
  vi.restoreAllMocks()
})

describe('risk acknowledgement', () => {
  it('reads false until one key is recorded, independently of other risks', () => {
    expect(isRiskAcknowledged(KEY)).toBe(false)
    acknowledgeRisk(KEY)
    expect(isRiskAcknowledged(KEY)).toBe(true)
    expect(isRiskAcknowledged('another-risk')).toBe(false)
  })

  it('treats blocked storage as unacknowledged and keeps the write silent', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(isRiskAcknowledged(KEY)).toBe(false)
    expect(() => { acknowledgeRisk(KEY) }).not.toThrow()
  })
})
