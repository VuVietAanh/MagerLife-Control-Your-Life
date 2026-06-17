export const AUTH_ACCOUNT_STORAGE_KEY = "magerlife.auth.accounts.v1";

export function normalizeAuthAccountKey(key: string) {
  return key.trim().toLowerCase();
}

export function loadAuthAccounts<TProfile>(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return {} as Record<string, TProfile>;
  try {
    const raw = storage.getItem(AUTH_ACCOUNT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TProfile>) : {};
  } catch {
    return {} as Record<string, TProfile>;
  }
}

export function getAuthAccount<TProfile>(
  key: string,
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  const accounts = loadAuthAccounts<TProfile>(storage);
  return accounts[normalizeAuthAccountKey(key)];
}

export function saveAuthAccount<TProfile>(
  key: string,
  profile: TProfile,
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return;
  try {
    const accounts = loadAuthAccounts<TProfile>(storage);
    storage.setItem(
      AUTH_ACCOUNT_STORAGE_KEY,
      JSON.stringify({ ...accounts, [normalizeAuthAccountKey(key)]: profile })
    );
  } catch {
    // Browser storage is optional in the demo flow.
  }
}
