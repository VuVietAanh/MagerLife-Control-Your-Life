const configuredApiBaseUrl = import.meta.env?.VITE_MAGERLIFE_API_BASE_URL as string | undefined;

export const MAGERLIFE_API_BASE_URL =
  configuredApiBaseUrl || (import.meta.env?.DEV ? "http://127.0.0.1:8787" : "/api");
