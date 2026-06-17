import type { ApiEndpointMap, ApiResult } from "./apiContracts";
import { MAGERLIFE_API_BASE_URL } from "./apiConfig";
import { getAuthSessionToken } from "./authSessionService";

export type ApiEndpoint = keyof ApiEndpointMap;

export type ApiClientOptions = {
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export async function callMagerLifeApi<TEndpoint extends ApiEndpoint>(
  endpoint: TEndpoint,
  request: ApiEndpointMap[TEndpoint]["request"],
  options: ApiClientOptions = {}
): Promise<ApiResult<ApiEndpointMap[TEndpoint]["response"]>> {
  const [method, path] = endpoint.split(" ") as ["GET" | "POST" | "PATCH" | "PUT", string];
  const baseUrl = options.baseUrl || MAGERLIFE_API_BASE_URL;
  const fetcher = options.fetcher || fetch;
  const url = method === "GET"
    ? `${baseUrl}${path}?payload=${encodeURIComponent(JSON.stringify(request))}`
    : `${baseUrl}${path}`;

  try {
    const token = getAuthSessionToken();
    const response = await fetcher(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(request),
    });
    if (!response.ok) {
      let apiError: { code?: string; message?: string } | null = null;
      try {
        const payload = await response.json();
        apiError = payload?.error || null;
      } catch {
        apiError = null;
      }
      return {
        ok: false,
        error: {
          code: apiError?.code || `HTTP_${response.status}`,
          message: apiError?.message || response.statusText || "API request failed",
        },
      };
    }
    return {
      ok: true,
      data: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : "Cannot reach MagerLife API",
      },
    };
  }
}
