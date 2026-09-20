/**
 * Browser-scoped acknowledgements for the shared risk dialog. A surface that
 * gates a sensitive choice behind {@link RiskConfirmation} records the
 * acknowledgement under a stable key, so the warning is accepted once per
 * browser instead of on every switch to the same sensitive value.
 */

/** localStorage entry prefix: one entry per acknowledged risk key. */
const ACKNOWLEDGEMENT_PREFIX = 'dsh.risk-acknowledged.'

/**
 * Read one risk key for this browser.
 * @param key - stable risk identifier owned by the gating surface.
 * @returns whether this browser already recorded the acknowledgement; false
 * when storage is unavailable, which keeps the warning in place.
 */
export function isRiskAcknowledged(key: string): boolean {
  try {
    return localStorage.getItem(`${ACKNOWLEDGEMENT_PREFIX}${key}`) === '1'
  } catch {
    // Blocked or missing storage: the surface asks again rather than assuming consent.
    return false
  }
}

/**
 * Record one accepted risk for this browser.
 * @param key - stable risk identifier owned by the gating surface.
 */
export function acknowledgeRisk(key: string): void {
  try {
    localStorage.setItem(`${ACKNOWLEDGEMENT_PREFIX}${key}`, '1')
  } catch {
    // Blocked or missing storage: the acceptance stays with the current page only.
  }
}
