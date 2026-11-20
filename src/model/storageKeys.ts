const prefix = 'ann-arbor-housing-board:'
export const storageKey = (accountId: string) => prefix + 'v2:account:' + accountId

export function clearLegacyProfiles(storage: Storage = localStorage) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i)
    if (key && (key === prefix + 'v1:guest' || key.startsWith(prefix + 'v1:account:')))
      storage.removeItem(key)
  }
}
