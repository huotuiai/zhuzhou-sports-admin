let lastFallbackTimestamp = 0
let fallbackSequence = 0

function fallbackId(): string {
  const timestamp = Date.now()
  fallbackSequence = timestamp === lastFallbackTimestamp ? fallbackSequence + 1 : 0
  lastFallbackTimestamp = timestamp
  const random = Math.random().toString(36).slice(2) || '0'
  return `${timestamp.toString(36)}-${fallbackSequence.toString(36)}-${random}`
}

/**
 * `crypto.randomUUID()` is available only in secure contexts in some browsers.
 * LAN development commonly runs over plain HTTP, so keep a collision-resistant
 * local fallback for mock data and demo sessions.
 */
export function createClientId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : fallbackId()
}
