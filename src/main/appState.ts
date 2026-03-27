/**
 * Module-scoped application state flags.
 * Replaces (app as any).isQuitting pattern.
 */

let quitting = false

export function isAppQuitting(): boolean {
  return quitting
}

export function setAppQuitting(value: boolean): void {
  quitting = value
}
