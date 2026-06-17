export const AUTH_SESSION_TOKEN_STORAGE_KEY = "magerlife.auth.sessionToken.v1";

export function getAuthSessionToken(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return "";
  try {
    return storage.getItem(AUTH_SESSION_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveAuthSessionToken(
  token: string,
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage || !token) return;
  try {
    storage.setItem(AUTH_SESSION_TOKEN_STORAGE_KEY, token);
  } catch {
    // Session persistence is optional in restricted browsers.
  }
}

export function clearAuthSessionToken(
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage
) {
  if (!storage) return;
  try {
    storage.removeItem(AUTH_SESSION_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures in demo/dev mode.
  }
}
