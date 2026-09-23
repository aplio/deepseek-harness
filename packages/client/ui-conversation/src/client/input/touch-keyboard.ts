/**
 * Touch-device detection for the composer's focus policy. A device that pairs
 * a coarse pointer with no hover capability opens an on-screen keyboard when a
 * text surface takes focus, and that keyboard covers the conversation; the
 * composer therefore skips programmatic focus there and drops focus after a
 * submit, while pointer devices keep the desktop behavior.
 */

/**
 * Whether this browser drives text entry through an on-screen keyboard.
 * @returns true on touch-primary devices; false where no media query API exists.
 */
export function usesTouchKeyboard(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (hover: none)').matches
}
