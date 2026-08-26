export const LEGACY_MOCK_STORAGE_KEYS = [
  'zz-sports-operation-logs:v1',
  'zz-sports-rbac:v2',
  'zz-sports-user-services:v1',
] as const

export function clearLegacyMockStorage(storage?: Storage): void {
  try {
    const target = storage ?? (typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage)
    if (!target) return
    for (const key of LEGACY_MOCK_STORAGE_KEYS) target.removeItem(key)
  }
  catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}
